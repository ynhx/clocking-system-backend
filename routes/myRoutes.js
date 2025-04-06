const express = require('express');
const router = express.Router();
const db = require('../db');

// add a supervisor into the database
router.post('/supervisors', (req, res) => {
  const { staffNumber, email } = req.body;

  if (!email || !staffNumber) {
    return res.status(400).json({ error: 'Email and staff number are required' })
  }

  db.query('INSERT INTO supervisors (staff_number, email) VALUES (?, ?)',
    [staffNumber, email], (err, result) => {
      if (err) {
        console.error('Database query error: ', err);
        return res.status(500).send(err);
      }

      res.json({ success: true, id: result.insertId });
    });
});

// add a student into the database
router.post('/students', (req, res) => {
  const { studentNumber, email } = req.body;

  if (!studentNumber || !email) {
    return res.status(400).json({ error: 'Student number and email are required' });
  }

  db.query('INSERT INTO students (student_number, email) VALUES (?, ?)',
    [studentNumber, email], (err, result) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).send(err);
      }

      db.query('INSERT INTO first_login_status (email) VALUES (?)',
        [email], (err2) => {
          if (err2) {
            console.error('Error inserting into first_login_status:', err2);
            return res.status(500).send(err2);
          }

          res.json({ success: true, id: result.insertId });
        });
    });
});

// setting up a new password after the first login
router.post('/setup-password', async (req, res) => {
  const { email, newPassword, userType } = req.body;

  try {
    let table = '';
    if (userType === 'student') table = 'students';
    else if (userType === 'supervisor') table = 'supervisors';
    else return res.status(400).json({ error: 'Invalid userType' });

    await db.promise().query(
      `UPDATE ${table} SET password = ? WHERE email = ?`,
      [newPassword, email]
    );

    await db.promise().query(
      'UPDATE first_login_status SET is_first_login = FALSE WHERE email = ?',
      [email]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password update failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/*
the idea of this is to search both tables of the database to determine if a user is logging in for the
first time and handle accordingly
*/
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check students table
    const [student] = await db.promise().query(
      'SELECT student_number, email, password FROM students WHERE email = ?',
      [email]
    );

    if (student.length > 0) {
      const [firstLoginStatus] = await db.promise().query(
        'SELECT * FROM first_login_status WHERE email = ?',
        [email]
      );

      const [attendanceHistory] = await db.promise().query(
        'SELECT * FROM StudentAttendance WHERE student_number = ?',
        [student[0].student_number]
      );

      const isFirstLogin = firstLoginStatus.length > 0 && firstLoginStatus[0].is_first_login;

      if (isFirstLogin) {
        if (password === 'user') {
          return res.json({
            role: 'student',
            firstLogin: true,
            email: student[0].email,
            userId: student[0].student_number,
            attendanceHistory
          });
        } else {
          return res.status(401).json({ error: 'Invalid password for first-time login' });
        }
      } else {
        if (student[0].password !== password) {
          return res.status(401).json({ error: 'Incorrect password' });
        }

        return res.json({
          role: 'student',
          firstLogin: false,
          email: student[0].email,
          userId: student[0].student_number,
          attendanceHistory
        });
      }
    }

    // Check supervisors table
    const [supervisor] = await db.promise().query(
      'SELECT staff_number, email, password FROM supervisors WHERE email = ?',
      [email]
    );

    if (supervisor.length > 0) {
      const [firstLoginStatus] = await db.promise().query(
        'SELECT * FROM first_login_status WHERE email = ?',
        [email]
      );

      const [attendanceHistory] = await db.promise().query(
        'SELECT * FROM SupervisorAttendance WHERE staff_number = ?',
        [supervisor[0].staff_number]
      );

      const isFirstLogin = firstLoginStatus.length > 0 && firstLoginStatus[0].is_first_login;

      if (isFirstLogin) {
        if (password === 'user') {
          return res.json({
            role: 'supervisor',
            firstLogin: true,
            email: supervisor[0].email,
            userId: supervisor[0].staff_number,
            attendanceHistory
          });
        } else {
          return res.status(401).json({ error: 'Invalid password for first-time login' });
        }
      } else {
        if (supervisor[0].password !== password) {
          return res.status(401).json({ error: 'Incorrect password' });
        }

        return res.json({
          role: 'supervisor',
          firstLogin: false,
          email: supervisor[0].email,
          userId: supervisor[0].staff_number,
          attendanceHistory
        });
      }
    }

    return res.status(404).json({ error: 'User not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// fetch all users from the database
router.get('/all-users', (req, res) => {
  db.query('SELECT student_number, email, role FROM students', (err, studentResults) => {
    if (err) {
      console.error('Error fetching students:', err);
      return res.status(500).json({ error: 'Failed to fetch students' });
    }

    db.query('SELECT staff_number, email, role FROM supervisors', (err, supervisorResults) => {
      if (err) {
        console.error('Error fetching supervisors:', err);
        return res.status(500).json({ error: 'Failed to fetch supervisors' });
      }

      const students = studentResults.map(u => ({
        studentNumber: u.student_number,
        email: u.email,
        role: u.role
      }));

      const supervisors = supervisorResults.map(u => ({
        studentNumber: u.staff_number,
        email: u.email,
        role: u.role
      }));

      const combinedUsers = [...students, ...supervisors];

      res.json(combinedUsers);
    });
  });
});

// handle the clock out logic
router.post('/clock-in', async (req, res) => {
  const { userId, role } = req.body;
  const currentDate = new Date();

  try {
    if (role === 'student') {
      const [student] = await db.promise().query(
        'SELECT * FROM students WHERE student_number = ?',
        [userId]
      );

      if (student.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const [existingRecord] = await db.promise().query(
        `SELECT * FROM StudentAttendance WHERE student_number = ? AND clock_out IS NULL AND DATE(clock_in) = CURDATE()`,
        [userId]
      );

      if (existingRecord.length > 0) {
        return res.status(400).json({ error: 'You have already clocked in today. Please clock out before clocking in again.' });
      }

      await db.promise().query(
        `INSERT INTO StudentAttendance (student_number, clock_in, date) VALUES (?, ?, CURDATE())`,
        [userId, currentDate]
      );

      return res.json({ message: 'Student clock in recorded successfully!' });
    } else if (role === 'supervisor') {
      const [supervisor] = await db.promise().query(
        'SELECT * FROM supervisors WHERE staff_number = ?',
        [userId]
      );

      if (supervisor.length === 0) {
        return res.status(404).json({ error: 'Supervisor not found' });
      }

      const [existingRecord] = await db.promise().query(
        `SELECT * FROM SupervisorAttendance WHERE staff_number = ? AND clock_out IS NULL AND DATE(clock_in) = CURDATE()`,
        [userId]
      );

      if (existingRecord.length > 0) {
        return res.status(400).json({ error: 'You have already clocked in today. Please clock out before clocking in again.' });
      }

      await db.promise().query(
        `INSERT INTO SupervisorAttendance (staff_number, clock_in, date) VALUES (?, ?, CURDATE())`,
        [userId, currentDate]
      );

      return res.json({ message: 'Supervisor clock in recorded successfully!' });
    } else {
      return res.status(400).json({ error: 'Invalid role provided' });
    }
  } catch (error) {
    console.error('Error during clock-in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// handle the clock out logic
router.post('/clock-out', async (req, res) => {
  const { userId, role } = req.body;
  const currentDate = new Date();

  try {
    if (role === 'student') {
      const [existingRecord] = await db.promise().query(
        `SELECT * FROM StudentAttendance WHERE student_number = ? AND DATE(clock_in) = CURDATE() AND clock_out IS NULL`,
        [userId]
      );

      if (existingRecord.length === 0) {
        return res.status(400).json({ error: 'You need to clock in before you can clock out.' });
      }

      await db.promise().query(
        `UPDATE StudentAttendance SET clock_out = ? WHERE student_number = ? AND DATE(clock_in) = CURDATE() AND clock_out IS NULL`,
        [currentDate, userId]
      );

      return res.json({ message: 'Student clock out recorded successfully!' });
    } else if (role === 'supervisor') {
      const [existingRecord] = await db.promise().query(
        `SELECT * FROM SupervisorAttendance WHERE staff_number = ? AND DATE(clock_in) = CURDATE() AND clock_out IS NULL`,
        [userId]
      );

      if (existingRecord.length === 0) {
        return res.status(400).json({ error: 'You need to clock in before you can clock out.' });
      }

      await db.promise().query(
        `UPDATE SupervisorAttendance SET clock_out = ? WHERE staff_number = ? AND DATE(clock_in) = CURDATE() AND clock_out IS NULL`,
        [currentDate, userId]
      );

      return res.json({ message: 'Supervisor clock out recorded successfully!' });
    } else {
      return res.status(400).json({ error: 'Invalid role provided' });
    }
  } catch (error) {
    console.error('Error during clock-out:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// get the attendance for a specific user
router.get('/attendance/:userId', async (req, res) => {
  const userId = req.params.userId;
  const role = req.query.role;

  try {
      let attendanceRecords;

      if (role === 'student') {
          attendanceRecords = await db.promise().query(
              'SELECT * FROM StudentAttendance WHERE student_number = ?',
              [userId]
          );
      } else if (role === 'supervisor') {
          attendanceRecords = await db.promise().query(
              'SELECT * FROM SupervisorAttendance WHERE staff_number = ?',
              [userId]
          );
      } else {
          return res.status(400).json({ error: 'Invalid role' });
      }

      res.json(attendanceRecords[0]);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

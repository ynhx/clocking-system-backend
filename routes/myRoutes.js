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
      res.json({ success: true, id: result.insertId });
    });
});

// fetch a single user from the database

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

module.exports = router;

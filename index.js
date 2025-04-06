const express = require('express');
const cors = require('cors');
const app = express();
const db = require('./db');
const myRoutes = require('./routes/myRoutes');

app.use(cors());
app.use(express.json());

app.use('/api/myRoutes', myRoutes);

app.listen(5000, () => console.log('server running on port 5000'));

require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./config/db')();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/authRoutes'));

app.listen(process.env.PORT, () =>
  console.log('Server running on port', process.env.PORT)
);

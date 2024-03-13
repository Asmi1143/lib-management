const express = require("express");
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const { captureRejectionSymbol } = require("events");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

dotenv.config(); // Load environment variables
console.log(
  process.env.HOST,
  process.env.USER,
  process.env.PASSWORD,
  process.env.DATABASE,
)
const db = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
});

// WebSocket setup
wss.on('connection', (ws) => {
    console.log('WebSocket connected');

    // Handle messages from clients (e.g., admin)
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Broadcast the event and data to all clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    });
});

// MySQL connection
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err.message);
    } else {
        console.log('Connected to MySQL database');
    }
});

app.post('/signup', (req, res) => {
  const { name, email, password } = req.body;
  const query = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';

  db.query(query, [name, email, password], (err, results) => {
    if (err) {
      console.error('Error executing signup query:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(200).json({ message: 'Signup successful' });
    }
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const query = 'SELECT * FROM users WHERE email = ? AND password = ?';

  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error('Error executing login query:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      if (results.length > 0) {
        res.status(200).json({ message: 'Success' });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    }
  });
});

app.get('/searchBooks', (req, res) => {
    const { query } = req.query;
    
    const sql = `SELECT id, title, author, subject, publishDate, availableCopies FROM books WHERE title LIKE ? OR author LIKE ? OR subject LIKE ? OR publishDate LIKE ?`;
    const searchValue = `%${query}%`;
    const values = [searchValue, searchValue, searchValue, searchValue];

    db.query(sql, values, (err, data) => {
        if (err) {
            return res.json("Error");
        }
        return res.json(data);
    });
});

app.post('/addBook', (req, res) => {
    const sql = "INSERT INTO books (title, author, subject, publishDate, availableCopies) VALUES ?";
    const values = [
        [req.body.title, req.body.author, req.body.subject, req.body.publishDate, req.body.availableCopies]
    ];

    db.query(sql, [values], (err, data) => {
        if (err) {
            return res.json("Error");
        }

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'bookAdded' }));
            }
        });

        return res.json(data);
    });
});

app.post('/removeBook', (req, res) => {
    console.log(req);
    const { title } = req.body;
    const sql = 'DELETE FROM books WHERE title = ?';

    db.query(sql, [title], (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Error removing book' });
        }

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'bookRemoved', bookTitle: title }));
            }
        });

        return res.status(200).json({ success: true, message: 'Book removed successfully' });
    });
});

app.post('/borrowBook', (req, res) => {
    const { title } = req.body;
    const sqlSelect = 'SELECT availableCopies FROM books WHERE title= ?';
    const sqlUpdate = 'UPDATE books SET availableCopies = ? WHERE title= ?';
    db.query(sqlSelect, [title], (err, result) => {
        if (err) {
            return res.json({ error: 'Error fetching available copies' });
        }

        const availableCopies = result[0].availableCopies;

        if (availableCopies > 0) {
            db.query(sqlUpdate, [availableCopies - 1, title], (updateErr, sqlUpdate) => {
                if (updateErr) {
                    return res.json({ error: 'Error updating available copies' });
                }

                return res.json({ success: true, message: 'Book borrowed successfully' });
            });
        } else {
            return res.json({ error: 'No available copies for borrowing' });
        }
    });
});
app.get('/getBooks',(req,res)=>{
  const q = 'select * from books';
  db.query(q,(err,result)=>{
    if(err){
      console.log(err);
      return res.status(500).json({message:"failed to retrieve books"});
    }
    res.status(201).json(result);
  })

})

server.listen(5000, () => {
    console.log("Server listening on port 5000");
});

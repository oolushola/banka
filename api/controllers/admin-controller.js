import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import config from '../../config';
import '@babel/polyfill';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.CONNINFO,
});

class adminController {
  static adminLogin(req, res, next) {
    const { email, password } = req.body;

    const checkLoginInfo = 'SELECT id, email, password, user_type, is_admin FROM users WHERE email = $1 ';
    pool.query(checkLoginInfo, [email], (err, result) => {
      if (err) return next(err);
      if (result.rows.length <= 0) {
        return res.status(404).send({
          auth: false, token: null, msg: 'user not found',
        });
      }
      if ((result.rows[0].user_type !== 'admin') && (result.rows[0].is_admin !== true)) {
        return res.status(401).send({
          status: 401, auth: false, msg: 'unauthorized',
        });
      }

      const getPassword = bcrypt.compareSync(password, result.rows[0].password);
      if (!getPassword) {
        return res.status(401).send({
          status: 401, auth: false, token: null, msg: 'invalid login',
        });
      }

      const token = jwt.sign({ id: result.rows[0].id }, config.secret, { expiresIn: 86400 });
      return res.status(200).send({
        status: 200, auth: true, token, msg: 'login successful',
      });
    });
  }

  static giveAccountNumber(req, res) {
    const token = req.headers.authorization;
    jwt.verify(token, config.secret, (err, decoded) => {
      if (err) {
        return res.status(401).send({
          status: 401, auth: false, token: null, msg: 'unverifiable token',
        });
      }

      const id = decoded;
      const { ownerId, accountNumber } = req.body;

      const checkUser = 'SELECT * FROM accounts WHERE owner = $1 ';
      pool.query(checkUser, [ownerId], (err, result) => {
        if (err) return res.status(500).send('internal server error');
        if (result.rows.length <= 0) {
          return res.status(404).send({
            status: 404, msg: 'user not found', id,
          });
        }

        const updateAccountNumber = 'UPDATE accounts SET account_number = $1 WHERE owner = $2';
        pool.query(updateAccountNumber, [accountNumber, ownerId], async (err, content) => {
          if (err) {
            return res.status(500).send({
              status: 500, msg: 'internal server error',
            });
          }
          await res.status(201).send({
            status: 201, msg: 'account number assigned', content,
          });
        });
      });
    });
  }

  static updateAccountStatus(req, res, next) {
    const token = req.headers.authorization;
    jwt.verify(token, config.secret, (err, decoded) => {
      if (err) res.status(401).send({ status: 401, msg: 'unverifiable token' });
      const { ownerId, status } = req.params;
      const { id } = decoded;

      const checkUser = 'SELECT email, user_type, is_admin  FROM users WHERE id = $1 AND is_admin = $2';
      pool.query(checkUser, [id, true], (err, content) => {
        if (err) return next(err);
        if (content.rows.length <= 0) return res.status(401).send({ status: 401, msg: 'unauthorized user' });
      });

      const updateAccountByStatus = 'UPDATE accounts SET account_status = $1 WHERE owner = $2 ';
      pool.query(updateAccountByStatus, [status, ownerId], async (error, result) => {
        if (error) return res.send('something went wrong');
        await res.status(201).send({ status: 201, msg: 'account status updated' });
      });
    });
  }

  static adminRegister(req, res, next) {
    const token = req.headers.authorization;
    jwt.verify(token, config.secret, (err, decoded) => {
      if (err) {
        return res.status(401).send({
          status: 401, msg: 'unverifiable token',
        });
      }
      const { id } = decoded;

      const checkUser = 'SELECT email, user_type, is_admin  FROM users WHERE id = $1 AND is_admin = $2';
      pool.query(checkUser, [id, true], (err, content) => {
        if (err) return next(err);
        if (content.rows.length <= 0) {
          return res.status(401).send({
            status: 401, msg: 'unauthorized user',
          });
        }
      });
      const {
        userType, firstName, lastName, email, password, phoneNo,
      } = req.body;

      let isAdmin;
      if (userType === 'staff') { isAdmin = false; }
      if (userType === 'admin') { isAdmin = true; }

      const hashedPassword = bcrypt.hashSync(password, 8);
      const checkQueryText = 'SELECT email FROM users where email = $1';
      pool.query(checkQueryText, [email], (err, result) => {
        if (err) throw err;
        if (result.rows.length >= 1) {
          return res.status(409).send({ 
            status: 409, msg: 'record exists', 
          });
        }
        const insertQuery = 'INSERT INTO users (email, password, first_name, last_name,  user_type, phone_no, is_admin, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
        const createdAt = new Date();
        pool.query(insertQuery, [email, hashedPassword, firstName, lastName, userType, phoneNo, isAdmin, createdAt], async () => {
          if (err) throw err;
          await res.status(201).send({ 
            status: 201, msg: 'registration successful',
          });
        });
      });
    });
  }
}

export default adminController;

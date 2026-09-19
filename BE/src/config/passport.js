const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email returned from Google'), null);

      const googleId = profile.id;
      const name = profile.displayName || email.split('@')[0];

      // Already linked to a Google account
      let result = await db.query(
        'SELECT id, email, name FROM users WHERE google_id = $1',
        [googleId]
      );
      if (result.rows.length > 0) return done(null, result.rows[0]);

      // Email matches an existing account — link it
      result = await db.query(
        'SELECT id, email, name FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length > 0) {
        await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, result.rows[0].id]);
        return done(null, result.rows[0]);
      }

      // New user — create account (no password)
      result = await db.query(
        'INSERT INTO users (name, email, google_id) VALUES ($1, $2, $3) RETURNING id, email, name',
        [name, email, googleId]
      );
      return done(null, result.rows[0]);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;

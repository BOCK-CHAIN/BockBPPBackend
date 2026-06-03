# Scholar Backend API

Backend for the Scholar project. Handles patents, inventors, research stuff, library data, and user accounts. Built with Node.js and Express.

## What is this?

It's basically an API that deals with:

- **Auth** - login, sessions, user stuff
- **Patents** - create, update, delete patents
- **Inventors** - inventor info and profiles
- **Scholar** - research and scholarly data
- **Library** - documents and resources
- **Contributions** - tracking what users add to the system

## Setup

You'll need:

- **Node.js** (v14+) - [get it here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Supabase account** - [sign up here](https://supabase.com/)

## How to Get It Running

1. Clone it:

```bash
git clone <your-repo-url>
cd bpp_backend
```

2. Install stuff:

```bash
npm install
```

3. Create a `.env` file and add your Supabase keys:

```
PORT=3000
SUPABASE_URL=your_url_here
SUPABASE_ANON_KEY=your_key_here
```

You can get those from your Supabase dashboard.

## Running It

Development (restarts automatically when you change stuff):

```bash
npm run dev
```

Production:

```bash
npm start
```

It'll run on `http://localhost:3000` by default.

## Routes

- `/auth` - login, signup, logout
- `/patents` - patent stuff
- `/inventors` - inventor info
- `/scholar` - research data
- `/library` - files and docs
- `/contributions` - user activity

Most routes support GET, POST, PUT, DELETE depending on what you're doing.

## Project Structure

```
src/
├── index.js              # Main server file
├── config/
│   └── supabase.js       # Supabase setup
├── middleware/
│   └── session.js        # Auth middleware
└── routes/
    ├── auth.js
    ├── patents.js
    ├── inventors.js
    ├── scholar.js
    ├── library.js
    └── contributions.js
```

## Dependencies

- **Express** - handles the API
- **Supabase** - database and auth
- **bcryptjs** - encrypts passwords
- **CORS** - allows requests from frontend
- **dotenv** - loads env variables
- **multer** - handles file uploads
- **nodemon** - auto-reloads the server when developing

## Issues

**Port already taken?**

```bash
# just change it in .env
PORT=3001
```

**Supabase not connecting?**

- check your SUPABASE_URL and SUPABASE_ANON_KEY in .env
- make sure the Supabase project isn't paused

**CORS errors?**
Only localhost works right now. If you need to allow other origins, update the CORS config in src/index.js

## Tips

- Use `npm run dev` while coding - saves time
- Check console errors, they usually tell you what's wrong
- Always set your .env variables before starting

## Push to GitHub

1. First time setup:

```bash
git init
git add .
git commit -m "initial commit"
```

2. Create a repo on GitHub and copy the URL

3. Then:

```bash
git remote add origin <your-url>
git branch -M main
git push -u origin main
```

## Working with Others

- Make a branch for your stuff: `git checkout -b your-feature`
- Do your thing
- Push and make a PR

## Stuck?

Server not starting? Check:

- Is the error in the console?
- Is .env set up right?
- Did you run `npm install`?

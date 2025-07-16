# WhatsApp Marketing Application

A Node.js application for WhatsApp marketing campaigns, built with Express, TypeORM, and MySQL.

## Features

- User authentication and authorization
- Contact management
- Template creation and management
- Message scheduling and sending
- Campaign analytics

## Tech Stack

- Node.js
- Express.js
- TypeScript
- TypeORM
- MySQL
- JWT Authentication

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

## Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/whatsapp-marketing.git
   cd whatsapp-marketing
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and other settings
   ```

4. Run database migrations
   ```bash
   npm run migrate
   ```

5. Start the development server
   ```bash
   npm run dev
   ```

## Development

- Run in development mode: `npm run dev`
- Run in production mode: `npm start`
- Run migrations: `npm run migrate`
- Rollback migrations: `npm run migrate:rollback`

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── controllers/    # Request handlers
│   │   └── middleware/     # Express middleware
│   ├── database/
│   │   ├── connection/     # Database connection setup
│   │   ├── entities/       # TypeORM entities
│   │   └── migrations/     # Database migrations
│   └── routes/             # API routes
├── uploads/                # Uploaded files
├── index.ts                # Application entry point
└── index.js               # JavaScript entry point
```

## License

MIT
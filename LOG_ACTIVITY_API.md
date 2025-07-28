# LogActivity API Documentation

The LogActivity controller provides endpoints to manage user activity logs in the system.

## Base URL
```
http://localhost:3000
```

## Authentication
All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Get All Log Activities
**GET** `/log-activities`

Returns all log activities with user information, ordered by creation date (newest first).

**Response:**
```json
{
  "logActivities": [
    {
      "id": 1,
      "user_id": 1,
      "action": "User logged in",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z",
      "user": {
        "id": 1,
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### 2. Get Log Activity by ID
**GET** `/log-activities/:id`

Returns a specific log activity by its ID.

**Response:**
```json
{
  "logActivity": {
    "id": 1,
    "user_id": 1,
    "action": "User logged in",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z",
    "user": {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    }
  }
}
```

### 3. Get Log Activities by User ID
**GET** `/log-activities/user/:userId`

Returns all log activities for a specific user.

**Response:**
```json
{
  "logActivities": [
    {
      "id": 1,
      "user_id": 1,
      "action": "User logged in",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z",
      "user": {
        "id": 1,
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### 4. Create Log Activity
**POST** `/log-activities`

Creates a new log activity entry.

**Request Body:**
```json
{
  "user_id": 1,
  "action": "User sent a message"
}
```

**Response:**
```json
{
  "message": "Log activity created successfully",
  "logActivity": {
    "id": 2,
    "user_id": 1,
    "action": "User sent a message",
    "created_at": "2024-01-15T10:35:00.000Z",
    "updated_at": "2024-01-15T10:35:00.000Z",
    "user": {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    }
  }
}
```

### 5. Update Log Activity (Admin Only)
**PUT** `/log-activities/:id`

Updates an existing log activity. Only administrators can perform this action.

**Request Body:**
```json
{
  "action": "Updated action description"
}
```

**Response:**
```json
{
  "message": "Log activity updated successfully",
  "logActivity": {
    "id": 1,
    "user_id": 1,
    "action": "Updated action description",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:40:00.000Z",
    "user": {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    }
  }
}
```

### 6. Delete Log Activity (Admin Only)
**DELETE** `/log-activities/:id`

Deletes a log activity. Only administrators can perform this action.

**Response:**
```json
{
  "message": "Log activity deleted successfully"
}
```

## Helper Function

The controller also provides a helper function `logUserActivity` that can be called from other controllers to automatically log user activities:

```typescript
import { LogActivityController } from '../controllers/LogActivityController';

// Example usage in another controller
try {
  await LogActivityController.logUserActivity(userId, 'User sent a template message');
} catch (error) {
  console.error('Failed to log activity:', error);
}
```

## Common Activity Examples

- `"User logged in"`
- `"User logged out"`
- `"User sent a message"`
- `"User created a template"`
- `"User updated profile"`
- `"User imported contacts"`
- `"User scheduled a message"`
- `"User joined chat room"`
- `"User updated agent status"`

## Error Responses

### 400 Bad Request
```json
{
  "message": "User ID and action are required"
}
```

### 404 Not Found
```json
{
  "message": "Log activity not found"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal server error"
}
```

## Integration with Existing Features

You can integrate activity logging into existing controllers by importing and using the helper function:

```typescript
// In AuthController.ts
import { LogActivityController } from './LogActivityController';

export const login = async (req: Request, res: Response) => {
  // ... existing login logic ...
  
  // Log the login activity
  try {
    await LogActivityController.logUserActivity(user.id, 'User logged in');
  } catch (error) {
    console.error('Failed to log login activity:', error);
  }
  
  return res.status(200).json({ token, user });
};
```
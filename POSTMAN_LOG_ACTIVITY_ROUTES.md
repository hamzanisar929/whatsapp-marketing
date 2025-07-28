# Postman Collection for Log Activity Controller

This document provides all the routes and request body examples for testing the Log Activity Controller endpoints in Postman.

## Base URL
```
http://localhost:3000/api
```

## Authentication
Most endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Get All Log Activities
**GET** `/log-activities`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Request Body:** None

**Response Example:**
```json
{
  "logActivities": [
    {
      "id": 1,
      "user_id": 1,
      "action": "User logged in: john@example.com",
      "created_at": "2024-01-15T10:30:00.000Z",
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

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**URL Parameters:**
- `id` (number): The ID of the log activity

**Example URL:** `/log-activities/1`

**Request Body:** None

**Response Example:**
```json
{
  "logActivity": {
    "id": 1,
    "user_id": 1,
    "action": "User logged in: john@example.com",
    "created_at": "2024-01-15T10:30:00.000Z",
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

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**URL Parameters:**
- `userId` (number): The ID of the user

**Example URL:** `/log-activities/user/1`

**Request Body:** None

**Response Example:**
```json
{
  "logActivities": [
    {
      "id": 1,
      "user_id": 1,
      "action": "User logged in: john@example.com",
      "created_at": "2024-01-15T10:30:00.000Z",
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

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_id": 1,
  "action": "Custom activity description"
}
```

**Request Body Fields:**
- `user_id` (number, required): The ID of the user performing the action
- `action` (string, required): Description of the action performed

**Response Example:**
```json
{
  "message": "Log activity created successfully",
  "logActivity": {
    "id": 5,
    "user_id": 1,
    "action": "Custom activity description",
    "created_at": "2024-01-15T10:30:00.000Z",
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

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**URL Parameters:**
- `id` (number): The ID of the log activity to update

**Example URL:** `/log-activities/1`

**Request Body:**
```json
{
  "action": "Updated activity description"
}
```

**Request Body Fields:**
- `action` (string, optional): New description of the action

**Response Example:**
```json
{
  "message": "Log activity updated successfully",
  "logActivity": {
    "id": 1,
    "user_id": 1,
    "action": "Updated activity description",
    "created_at": "2024-01-15T10:30:00.000Z",
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

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**URL Parameters:**
- `id` (number): The ID of the log activity to delete

**Example URL:** `/log-activities/1`

**Request Body:** None

**Response Example:**
```json
{
  "message": "Log activity deleted successfully"
}
```

## Common Error Responses

### 400 Bad Request
```json
{
  "message": "User ID and action are required"
}
```

### 401 Unauthorized
```json
{
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "message": "Access denied. Admin role required."
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

## Sample Activity Actions

Here are examples of activity actions that are automatically logged by the system:

- `"User registered: john@example.com"`
- `"User logged in: john@example.com"`
- `"Created category: Marketing"`
- `"Updated category: Sales"`
- `"Deleted category: Old Category"`
- `"Created template: Welcome Message"`
- `"Updated template: Promotion Template"`
- `"Deleted template: Outdated Template"`
- `"Created tag: VIP for user"`
- `"Deleted tag: Regular from user"`
- `"Password changed"`
- `"Updated contact: John Doe"`
- `"Updated tags for contact ID: 5"`
- `"Imported contacts from CSV"`

## Postman Collection Setup

1. Create a new collection in Postman
2. Set up environment variables:
   - `base_url`: `http://localhost:3000/api`
   - `jwt_token`: Your authentication token
3. Add each endpoint as a new request
4. Use `{{base_url}}` and `{{jwt_token}}` variables in your requests
5. Set up pre-request scripts to automatically include authentication headers

## Testing Workflow

1. **Authentication**: First, use the auth endpoints to register/login and get a JWT token
2. **Create Activities**: Test creating log activities with different user IDs and actions
3. **Retrieve Activities**: Test getting all activities, specific activities by ID, and activities by user
4. **Update/Delete**: Test admin-only operations (ensure you have admin role)
5. **Error Handling**: Test with invalid data to verify error responses

## Notes

- Admin role is required for update and delete operations
- All timestamps are in ISO 8601 format
- User relations are automatically populated in responses
- The system automatically creates log activities for various user actions across the application
- Log activities are ordered by creation date (newest first) by default
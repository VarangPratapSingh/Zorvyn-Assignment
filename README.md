# Zorvyn Assignment — Finance Data Processing & Access Control Backend

## Overview

This project is a full-stack implementation of a Finance Dashboard Backend System built to satisfy backend design, API structure, data modeling, and access control requirements.

---

## Assignment Coverage

### User & Role Management
- Roles: viewer, analyst, admin
- Status: active / inactive
- JWT authentication implemented
- Role-based access enforced using middleware (`auth`, `allowRoles`)

---

### Financial Records
- CRUD operations implemented
- Fields:
  - amount
  - type (income/expense)
  - category
  - date
  - note
- Soft delete implemented (`isDeleted`)
- Filtering + pagination + search

---

### Dashboard APIs
- Summary (income, expense, net)
- Category aggregation
- Recent activity
- Trends (monthly / weekly)
- Implemented using MongoDB aggregation pipelines

---

### Access Control
- Viewer → read only
- Analyst → own data + analytics
- Admin → full access
- Enforced via middleware + query-level filtering

---

### Validation & Error Handling
- Input validation (email, password, records)
- Proper HTTP status codes
- Central error handler

---

### Data Persistence
- MongoDB Atlas
- Indexed queries for performance

---

## Code Mapping

### Backend (`finance-backend/server.js`)
- Express server
- Mongoose schemas:
  - User
  - Record
- Middleware:
  - auth
  - allowRoles
- Helpers:
  - filters
  - pagination
  - aggregation logic

### Frontend (`src/app/page.js`)
- Handles:
  - authentication
  - dashboard UI
  - records CRUD
  - admin panel

---

## API Endpoints

Auth:
POST /api/auth/register  
POST /api/auth/login  
GET /api/auth/me  

Records:
GET /api/records  
POST /api/records  
PATCH /api/records/:id  
DELETE /api/records/:id  

Dashboard:
GET /api/dashboard/summary  
GET /api/dashboard/category  
GET /api/dashboard/recent  
GET /api/dashboard/trends  

Admin:
GET /api/admin/users  
PATCH /api/admin/users/:id  

---

## Environment Variables

Backend:
MONGO_URI=...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=https://zorvyn-assignment-three-mu.vercel.app
ADMIN_SECRET=admin
ANALYST_SECRET=analyst

Frontend:
NEXT_PUBLIC_API_URL=https://zorvyn-assignment-production-bf99.up.railway.app/api

---

## Deployment

Frontend:
https://zorvyn-assignment-three-mu.vercel.app

Backend:
https://zorvyn-assignment-production-bf99.up.railway.app

---

## Assumptions

- Role secrets determine elevated roles
- Analysts only access their own records
- Soft delete used for consistency

---

## Trade-offs

- Single-file backend for simplicity
- Regex search instead of full-text indexing
- No rate limiting or tests

---

## Author

Varang Pratap Singh
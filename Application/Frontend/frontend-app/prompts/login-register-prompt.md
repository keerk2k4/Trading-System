# Authentication UI — Login and Registration

Build the frontend authentication experience for the application using the existing Angular project, existing application architecture, and the established visual theme.

The application's visual theme is already defined separately. Follow that theme exactly. The authentication pages should feel like part of the same premium fintech/trading application, while being simpler and more focused than the main trading dashboard.

Do not redesign the application's overall theme or introduce a separate authentication design system.

---

## Backend Authentication API

The backend authentication service exposes the following endpoints.

### Register

```http
POST /auth/register
```

Request:

```json
{
  "username": "gaurang123",
  "password": "correct horse battery staple"
}
```

Username requirements:

- String
- Minimum 3 characters
- Maximum 64 characters
- Allowed characters:
  - letters
  - numbers
  - `.`
  - `-`
  - `_`

Password requirements:

- String
- Minimum 12 characters
- Maximum 128 characters

Successful response:

```json
{
  "id": "3571925b-7c54-49e4-aec0-fbdc78959278",
  "username": "gaurang123",
  "roles": [
    "CUSTOMER"
  ]
}
```

The public registration endpoint assigns the `CUSTOMER` role. The frontend must NOT provide a role selector during normal registration.

The backend returns HTTP `409` when the username is already registered.

The backend can return HTTP `422` for invalid input.

Registration does not return access or refresh tokens.

---

## Login

```http
POST /auth/login
```

Request:

```json
{
  "username": "gaurang123",
  "password": "correct horse battery staple"
}
```

Successful response:

```json
{
  "accessToken": "JWT_ACCESS_TOKEN",
  "refreshToken": "REFRESH_TOKEN",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

`expiresIn` represents the access-token lifetime in seconds.

A successful login provides:

- Access token
- Refresh token
- Token type
- Access-token expiry

The frontend should use the authentication service to manage these credentials rather than allowing individual components to directly manipulate authentication state.

---

## Authentication Errors

The backend uses an error response structure:

```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

### Invalid credentials

HTTP `401`

```json
{
  "errorCode": "AUTH-401",
  "message": "Unauthorised"
}
```

The UI should show a user-friendly authentication error without exposing implementation details.

Do not reveal whether the username exists.

### Username already registered

HTTP `409`

```json
{
  "errorCode": "AUTH-409",
  "message": "Username already registered"
}
```

Display an appropriate message near the registration form.

### Validation failure

HTTP `422`

```json
{
  "errorCode": "VAL-422",
  "message": "Invalid input"
}
```

Display an appropriate validation message.

Do not expose raw backend errors, stack traces, or implementation details to the user.

---

# Registration Page

Create a dedicated registration page/component.

The page should contain:

- Application branding
- Welcome/title section
- Username field
- Password field
- Password confirmation field
- Primary `Create account` button
- Link to the login page
- Appropriate validation/error messaging
- Loading state while registration is being submitted

The password confirmation field is frontend-only and must NOT be sent to the backend.

### Registration Validation

Username:

- Required
- Minimum 3 characters
- Maximum 64 characters
- Must match:

```regex
^[a-zA-Z0-9._-]+$
```

Password:

- Required
- Minimum 12 characters
- Maximum 128 characters

Confirm password:

- Required
- Must match the password

Validation should provide useful feedback without making the form visually noisy.

Prefer showing validation errors after the user has interacted with the relevant field or attempted submission.

### Successful Registration

After successful registration:

1. Do not assume the user is authenticated.
2. Do not attempt to use the registration response as an access token.
3. Show a clear success state.
4. Provide a clear path to the login page.

The registration response only contains:

```text
id
username
roles
```

---

# Login Page

Create a dedicated login page/component.

The page should contain:

- Application branding
- Welcome/back-to-account message
- Username field
- Password field
- Primary `Sign in` button
- Link to registration
- Authentication error area
- Loading state

### Login Validation

Username:

- Required
- Maximum 64 characters

Password:

- Required
- Maximum 128 characters

Do not unnecessarily duplicate backend validation logic beyond what is useful for immediate client-side feedback.

---

# Authentication UX

The authentication experience should feel polished and intentional.

### Loading

While a request is in progress:

- Disable form submission
- Prevent duplicate submissions
- Show an appropriate loading indicator
- Keep the user informed that the request is processing

Do not freeze the entire application.

### Errors

Errors should:

- Be visually clear
- Be accessible
- Use the application's semantic error styling
- Be associated with the relevant form when appropriate
- Avoid exposing backend implementation details

Do not display raw HTTP errors or stack traces.

### Success

Successful registration should clearly communicate that the account was created.

Successful login should transition the user into the authenticated application.

---

# Authentication State

Create/use an application-level authentication service responsible for authentication state.

The authentication service should encapsulate:

- Login
- Registration
- Logout
- Access-token state
- Refresh-token handling
- Current authenticated-user state
- Authentication status

Components should not directly implement token management.

The login component should call the authentication service rather than directly implementing authentication logic.

The registration component should call the authentication service rather than directly constructing HTTP requests.

Use the existing backend contract exactly.

Do not invent additional authentication endpoints.

---

# Token Handling

After successful login, persist the authentication state according to the application's existing security architecture.

The access token must be sent as:

```http
Authorization: Bearer <accessToken>
```

for protected API requests.

Authentication-related HTTP behavior should be centralized rather than duplicated across feature components.

Implement or reuse an HTTP interceptor for authenticated API requests if the project does not already have one.

The login component itself should not manually add Authorization headers to unrelated requests.

---

# Current User

The backend also exposes:

```http
GET /auth/me
```

This endpoint requires a Bearer token and returns:

```json
{
  "id": "3571925b-7c54-49e4-aec0-fbdc78959278",
  "username": "gaurang123",
  "accountId": 6,
  "roles": [
    "CUSTOMER"
  ]
}
```

Use the existing authentication architecture to retrieve and maintain the authenticated user's identity where appropriate.

Do not hard-code the username, account ID, or roles.

---

# Authentication Page Design

Use the established green fintech theme.

The authentication pages should have a cleaner composition than the dashboard.

### Dark mode

Use:

- Deep green-black background
- Dark green card/surface
- Bright green primary action
- Off-white headings
- Muted green-gray secondary text
- Subtle borders
- Soft, restrained shadows
- Green focus states

### Light mode

Use:

- White/light green-tinted background
- White authentication card
- Dark green typography
- Strong green primary action
- Subtle green-gray borders
- Clean, spacious layout

The authentication card should feel premium and polished.

Do not make the page look like a generic login template.

---

# Suggested Layout

Desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Application Branding                     │
│                                                             │
│              ┌─────────────────────────┐                    │
│              │                         │                    │
│              │       Welcome back      │                    │
│              │                         │                    │
│              │   Username              │                    │
│              │   ┌─────────────────┐   │                    │
│              │   │                 │   │                    │
│              │   └─────────────────┘   │                    │
│              │                         │                    │
│              │   Password              │                    │
│              │   ┌─────────────────┐   │                    │
│              │   │                 │   │                    │
│              │   └─────────────────┘   │                    │
│              │                         │                    │
│              │   ┌─────────────────┐   │                    │
│              │   │     Sign in     │   │                    │
│              │   └─────────────────┘   │                    │
│              │                         │                    │
│              │   Don't have an account?│                    │
│              │   Create one            │                    │
│              │                         │                    │
│              └─────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Registration should follow the same composition:

```text
Branding
    ↓
Create your account
    ↓
Username
Password
Confirm password
    ↓
Create account
    ↓
Already have an account? Sign in
```

Do not necessarily copy this exact wireframe if the existing application's routing/layout architecture suggests a better composition. The visual theme is the source of truth.

---

# Responsive Behavior

The authentication UI must work well on:

- Desktop
- Laptop
- Tablet
- Mobile

On mobile:

- Authentication card should use the available viewport width appropriately
- Avoid excessive horizontal padding
- Form controls should remain comfortable for touch
- Text should remain readable
- No horizontal scrolling
- Buttons should remain easy to tap

---

# Accessibility

The authentication pages must be fully accessible.

Ensure:

- Every input has an accessible label
- Errors are associated with the relevant controls
- Keyboard navigation works correctly
- Focus states are clearly visible
- Focus moves appropriately after major form state changes
- Color is not the only mechanism used to communicate errors
- Buttons have meaningful accessible names
- Password visibility controls, if implemented, are accessible
- Error messages are announced appropriately where necessary
- Contrast meets WCAG AA

---

# Routing

Create/reuse appropriate routes for:

```text
/login
/register
```

Authenticated application routes should remain protected by the application's existing authentication/route-guard architecture.

Unauthenticated users should be able to access login and registration.

After successful login, navigate to the appropriate authenticated landing page already defined by the application.

After successful registration, navigate to the login experience rather than directly entering the authenticated application.

Do not invent a new dashboard route if one already exists.

---

# Implementation Constraints

Before creating new files or services:

1. Inspect the existing Angular project structure.
2. Identify existing authentication services, interceptors, guards, models, routing, and shared UI components.
3. Reuse existing infrastructure where appropriate.
4. Do not duplicate authentication functionality.
5. Do not replace existing application architecture unnecessarily.
6. Do not modify unrelated features.
7. Follow the existing API base URL/environment configuration.
8. Keep authentication-specific logic separated from presentation components.

Create only the components, services, models, routes, and supporting files that are actually necessary.

The final implementation should provide a complete, production-quality login and registration experience integrated with the existing authentication API and the application's established visual theme.

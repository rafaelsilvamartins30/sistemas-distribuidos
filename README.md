# UNIR

**UNIR — University Network for Integration and Relationships**

UNIR is a university platform focused on helping users discover and participate in communities, activities and opportunities.

## Main domains

- **User** — users, authentication and user information.
- **Community** — university communities, managers, followers and public posts.
- **Activity** — events and activities with direct registration.
- **Opportunity** — opportunities with application and selection processes.
- **Payment** — payment lifecycle for paid activities.
- **Access** — QR credentials, access validation, check-in and attendance history.

## Main distributed flow

A paid activity registration may involve:

```text
Activity
  ↓ reserve registration / capacity
Payment
  ↓ confirm payment
Access
  ↓ issue credential
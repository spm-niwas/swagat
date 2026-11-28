# Security Specification — Swagat SPM NIWAS

## Phase 0: Data Invariants
1. **Default Deny**: No document in Firestore is readable or writable unless an explicit rule grants access to a verified authenticated user (`request.auth != null && request.auth.token.email_verified == true`).
2. **RBAC Integrity**: Only the bootstrapped Super Admin (`director@spmniwas.in` with `email_verified == true`) or Google emails explicitly registered in `/approvedAdmins/{emailKey}` have `isAdmin()` privileges. Users can never self-assign `admin`, `superadmin`, or `guard` roles without proving knowledge of an existing Admin-issued `pinCredentials/{credHash}` (`sha256` of Mobile + PIN).
3. **PII Isolation**: Mobile numbers, emails, and 4-digit PINs in `/directory/{entryId}`, `/pinCredentials/{credHash}`, and `/users/{userId}` are never exposed to blanket `isSignedIn()` reads or non-admin `list` queries. `/pinCredentials/{credHash}` can only be read by single-document `get` when the verified caller already knows both Mobile and PIN; `/pinResetRequests/{phoneHash}` stores only hashed mobile digests. Gate routing labels live in `/destinations/{destId}` without phone, email, or PIN.
4. **Visitor Ownership & State Machine**: Hosts can only read/approve/deny visitors matching their `hostUid`, `hostUids`, or `createdByUid`, and non-admin/non-guard users cannot alter a visitor once it reaches a terminal state (`DENIED` or `CHECKED_OUT`).
5. **Strict Schema, Bounds & Timestamps**: All writes validate `isValidId()`, exact key sets (`keys().hasAll(...)` / `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update), string `.size()` bounds, immutable `createdAt` / `createdByUid`, and server-enforced `request.time`.

## The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Directory Scrape**: `GET /directory` with `request.auth == null`.
2. **Blanket Signed-In Directory List**: `LIST /directory` by a non-admin signed-in user without filtering to their own `uid`/`email`.
3. **Email Spoofing Admin Bypass**: `WRITE /housingUnits/unit_1` where `token.email == 'director@spmniwas.in'` but `token.email_verified == false`.
4. **Self-Privilege Escalation on Signup**: `CREATE /users/{uid}` with `{ role: 'admin' }` by a regular signed-in user.
5. **Role Mutation via Update**: `UPDATE /users/{uid}` changing `role` from `'host'` to `'superadmin'`.
6. **Shadow Field Injection**: `CREATE /visitors/vis_1` including an extra ghost field `{ isVerified: true }`.
7. **ID Poisoning**: `CREATE /visitors/bad$id..1500chars` failing `isValidId()`.
8. **Timestamp Forgery**: `CREATE /visitors/vis_1` with `createdAt` set to a past client timestamp instead of `request.time`.
9. **Terminal State Bypass**: Non-admin user updating a `CHECKED_OUT` or `DENIED` visitor back to `APPROVED`.
10. **Host Spoofing Visitor Approval**: Host A (`uid_A`) attempting to update a `PENDING` visitor whose `hostUid` is `uid_B`.
11. **Value Poisoning**: Guard updating a visitor's `status` to an invalid string `'HACKED'` or oversized string.
12. **PII Leakage via Settings/Housing Units**: Non-admin attempting `WRITE /settings/campus` or `CREATE /admins/{uid}`.

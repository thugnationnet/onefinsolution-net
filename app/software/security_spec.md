# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Authentication & Email Verification**: Every read and write operation on `/user_assets/{assetId}` requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
2. **Ownership Isolation**: Users may only `get`, `list`, `create`, `update`, or `delete` documents in `/user_assets/{assetId}` where `ownerId == request.auth.uid`.
3. **Strict Schema & Volumetric Bounds**:
   - `assetId` must match `^[a-zA-Z0-9_\-]+$` and `size() <= 128`.
   - `ownerId` is a string (`1..128` chars, matching `^[a-zA-Z0-9_\-]+$`) equal to `request.auth.uid`.
   - `title` is a string (`1..160` chars).
   - `assetType` is one of `['template', 'image', 'video', 'music', 'science', 'transcript', 'grounding']`.
   - `summary` is a string (`1..2000` chars).
   - `createdAt` must equal `request.time` on creation and remain immutable on updates.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null`, creating a valid `UserAsset` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth.uid = 'user_1', email_verified = false` -> `PERMISSION_DENIED`.
3. **Cross-User Identity Spoofing**: `auth.uid = 'user_1'`, payload `ownerId: 'user_2'` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Create**: Payload includes `isAdmin: true` alongside required fields -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Update**: Update modifies `ownerId` or adds `hacked: true` -> `PERMISSION_DENIED`.
6. **Title Overflow Attack**: `title` length = 500 chars (> 160 max) -> `PERMISSION_DENIED`.
7. **Summary Resource Exhaustion**: `summary` length = 10,000 chars (> 2000 max) -> `PERMISSION_DENIED`.
8. **Invalid Enum Value**: `assetType: 'executable'` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `createdAt` set to past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immortal Field Mutation**: Updating `createdAt` or `ownerId` on an existing document -> `PERMISSION_DENIED`.
11. **ID Poisoning Attack**: Document ID contains spaces or special characters (`bad id!@#`) -> `PERMISSION_DENIED`.
12. **Unauthorized Cross-User List/Get**: `user_2` attempting to read or list `user_1`'s `/user_assets` -> `PERMISSION_DENIED`.

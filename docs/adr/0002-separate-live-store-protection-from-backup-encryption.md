---
status: accepted
date: 2026-11-22
---

# Separate live-store protection from backup encryption

For the first personal version, the user chose macOS session and disk protections for the live journal rather than an application-encrypted vault. The live SQLite file must be described accurately; the application cannot assume that FileVault is enabled.

The user separately required encrypted local backups and tested restore before real use, advancing them from README phase 6, and chose a dedicated portable backup passphrase with optional Keychain storage. A clean supported Mac must be able to restore with the backup and passphrase alone. Backup encryption is independent of live-store protection; its format and failure handling must be verified before real-data use. This trades a smaller initial application-locking surface for explicit dependence on macOS protections.

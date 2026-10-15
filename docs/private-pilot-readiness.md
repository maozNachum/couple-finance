# Private pilot readiness

Status meanings: VERIFIED = observed evidence for the stated scope; PENDING =
defined next action; BLOCKED = required dependency absent; NOT APPLICABLE =
outside the selected scope. A local green suite does not authorize real data.

| Gate | Status | Evidence or prerequisite / owner |
| --- | --- | --- |
| Task 14 merge and exact-master post-merge CI | VERIFIED | PR #14; SHA `29c3622bf79d27411f81ad4eb341eadc26184b7c`; successful push run 38642294172 |
| Existing stacks protected | VERIFIED | Inventory identifies existing couple-finance/task14 resources; recovery tool cannot adopt them |
| Local synthetic recovery | VERIFIED | 31 acceptance checks, exact 48-table parity, private bytes and canonical outputs; 105.250s local drill; see task-15a-report.md |
| New corruption/wrong-target guards | VERIFIED | 20 Node tests plus 11 actual adversarial checks, including interruption and missing Storage bytes |
| Real-data deployment | BLOCKED | Owner must choose hosting, HTTPS/network isolation, protected operator credentials and access policy; no deployment authorized here |
| Production invitation delivery | BLOCKED | Owner must choose SMTP/email provider, domain and redirects; maintainer must test delivery, expiry, reuse, rate limits and non-enumeration |
| Real user identity/email loss | BLOCKED | Owners must approve independent identity verification and operator recovery; maintainer must test it with production authentication configuration |
| Infrastructure admin MFA/recovery | BLOCKED | Operators must enable and test provider MFA, backup codes and authorized emergency access |
| Off-device backups and separate keys | BLOCKED | Owners approve custody/retention and storage; operators demonstrate backup and key retrieval after host loss |
| Revocations after backup point | BLOCKED | Operator must maintain a protected independent incident/revocation record and prove reconciliation before recovered real service exposure |
| RPO/RTO | PENDING | Owners approve proposed 24h/4h objectives; operator measures full off-device recovery including credential retrieval and incident decisions |
| Backup failure detection | BLOCKED | Owner selects notification/monitoring mechanism; operator tests missed backup, corrupt artifact, inaccessible key and recovery failure alerts |
| Retention/privacy | PENDING | Owners approve seven daily/four weekly proposal, staging bytes retained in backups, audit retention and disposal responsibilities |
| Exact-head independent review | PENDING | Reviewer receives source ZIP, manifest, hashes, diff and verification evidence; no merge without approval |
| Bank/card integration, dynamic FX, AI, mobile Task 15b | NOT APPLICABLE | Explicitly excluded from Task 15a |

The private pilot is **not ready for real financial data** while any required
gate above is pending or blocked. Local physical recovery is not proof of
managed-Supabase disaster recovery. No production backup, email or monitoring
guarantee is asserted.

Decisions requiring owner action: (1) managed hosting/backups reduce host
operations but need a separately verified Storage-byte recovery path and
provider configuration; (2) self-managed hosting enables this physical method
only after hardening, image/key custody and off-device recovery are demonstrated.
Choose based on operational ownership and measured recovery, not this lab's
elapsed time. Neither option is provisioned or approved by this task.

<title>ADR-0008</title>

# ADR-0008: Blockout keeps each account's role; one-time invites change it, and only `admin` comes from Keycloak

Status: accepted
Date: 2026-10-15
Supersedes: the roles part of [ADR-0002](0002-swappable-sign-in.md)

## Context

[ADR-0002](0002-swappable-sign-in.md) took roles from the token: realm roles in Keycloak, and with none, a school-domain account was a student and anyone else a parent. With open sign-in (Google, or registering in Keycloak) that doesn't hold:

- **Anyone could be a parent.** Every non-school account was one, and a permanent parent code was enough to follow a child.
- **Every teacher had to be set up by hand** in the Keycloak console.
- **The role changed with the token** on every request.

The project owner wants anyone to be able to sign in as a student; admins and teachers to turn people into teachers; and teachers (and children) to invite grown-ups.

## Decision

- **Blockout's database keeps the role.** A new account is a student (dev sign-in can pick another, for practice). Signing in never changes it.
- **Admins come from the token:** the Keycloak realm role `admin`, checked on every request and never stored.
- **One-time, expiring invites change roles:**
  - **Teacher codes** come from admins, and from teachers bringing in a colleague (10 waiting, 20 a day). They last 7 days.
  - **Grown-up codes** come from the child, their teacher or an admin. They last 14 days, are tied to the child, and link the grown-up on use.
  - **Codes are 8 characters,** shown once and stored as SHA-256 hashes. Using one is atomic, so a code works once even when two people try at the same moment.
  - **An account in use keeps its role:** a student in a class, or anyone already linked, can't take a teacher's or a grown-up's code.
- **Admins can also change a role directly,** except to take the role off a teacher who still has classes or tournaments.
- **Permanent per-student parent codes are retired** (a MongoDB migration removes them).
- **Deleting an account removes everything that belongs to it.** Admins can delete any account, a grown-up their child's, and teachers (without classes) and grown-ups their own.

## Consequences

- **Self-registration is safe to turn on.** A new account can't do more than a student until someone with the right to invite says so.
- **Every promotion is traceable:** `invitedBy` on the account, and audit records for codes made, codes used, role changes and deletions.
- **Keycloak's `student`, `teacher` and `parent` realm roles mean nothing any more.** The realm file drops them; existing assignments are ignored.
- **A teacher's school still comes from their email domain.** A teacher code made for a school is a note for admins, not a setting.
- **A parent who is also a teacher needs two accounts.** That's simpler than one account with two roles.

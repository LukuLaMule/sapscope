🇬🇧 English | 🇫🇷 [Français](guide-11-notes.fr.md)

# System Notes

**Access:** Admin or consultant assigned to the client

---

## Purpose

Notes allow consultants to leave free-text observations on a specific SAP system — observations during a review, action items, version remarks, etc. Notes are stored in SAPscope and visible to all users who have access to the client.

---

## Where to find notes

Open a system's detail page (click a system card in the Landscape view, or a row in the Inventory). The **Notes** section is in the right-hand column.

---

## Add a note

1. Type your text in the text area at the bottom of the Notes section
2. Click **Add Note**

The note is saved with your email and the current timestamp.

---

## Edit a note

You can only edit your own notes (admins can edit any note).

1. Click the **pencil icon** next to the note
2. Modify the text in the inline editor
3. Click **Save** — or **Cancel** to discard

---

## Delete a note

Click the **trash icon** next to a note. The deletion is immediate (no confirmation prompt).

You can only delete your own notes. Admins can delete any note.

---

## Notes are per system

Notes are scoped to a `(client, SID)` pair. The same SID on a different client has its own separate notes.

---

## FAQ

**Are notes included in the PDF report?**
Not currently — the report focuses on technical health data.

**Are notes visible to all users of the client?**
Yes — any user with access to the client (admin or assigned consultant) can read all notes for its systems.

**Is there a character limit?**
Yes — 4 000 characters per note.

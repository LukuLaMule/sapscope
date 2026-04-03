Design the snapshot comparison (diff) page of SAPscope. This page appears when a consultant clicks the compare button between two snapshots of the same SAP system.

## Layout
Same top nav and left sidebar. Main content area shows the diff.

## Header
- System ID: PRD
- Date range: "← Apr 2" ↔ "Apr 3 (current)"
- Back button "← Back to detail"

## Content: change sections

Only sections with actual changes are shown. Each section has a title, a badge showing the number of changes, and a table.

### System changes
Badge: "1 change"
Table with columns: Field / Before / After
- SAP Release: 617 → 618

### Component changes
Badge: "2 changed · +1 added"
Table with columns: Component / Before / After
- SAP_BASIS: SP0017 → SP0018 (changed)
- SAP_APPL: SP0007 → SP0008 (changed)
- NEW_COMP: — (not present) → 700 SP0001 (added, shown in green)

### Support Package changes
Badge: "3 changed · +2 added"
Table same structure as components.

### Custom Development changes
Badge: "+47 objects"
Table with columns: Object type / Delta
- PROG: +10
- CLAS: +5
- TABL: +8
- FUGR: +4
...

## Empty state
If no changes detected between the two snapshots, show a centered message: "No changes detected between these two snapshots."

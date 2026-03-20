# Session 14d: Design System, Responsive Design & Accessibility

**Prerequisite:** Session 14c (reliability/code quality) complete and tested
**Scope:** Phase 5 from audit punch list
**Goal:** Shared component library, mobile-responsive layout, WCAG AA accessibility, onboarding flow
**Rule:** Do NOT deploy. Commit all changes for review.

---

## Part A: Design System — Shared Component Library

### D-1: Create Design Tokens
**File:** `src/app/globals.css` — add CSS custom properties:
```css
:root {
  /* Surface colors */
  --color-surface-primary: #111827;   /* gray-900 */
  --color-surface-secondary: #1f2937; /* gray-800 */
  --color-surface-tertiary: #374151;  /* gray-700 */

  /* Text colors */
  --color-text-primary: #ffffff;
  --color-text-secondary: #d1d5db;    /* gray-300 */
  --color-text-tertiary: #9ca3af;     /* gray-400 */
  --color-text-muted: #6b7280;        /* gray-500 */

  /* Brand colors */
  --color-brand-primary: #2563eb;     /* blue-600 */
  --color-brand-hover: #1d4ed8;       /* blue-700 */
  --color-brand-light: #3b82f6;       /* blue-500 */

  /* Status colors */
  --color-success: #22c55e;           /* green-500 */
  --color-warning: #f59e0b;           /* amber-500 */
  --color-error: #ef4444;             /* red-500 */
  --color-info: #3b82f6;              /* blue-500 */

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 0.75rem;
  --space-lg: 1rem;
  --space-xl: 1.5rem;

  /* Border radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  /* Focus ring */
  --focus-ring: 0 0 0 2px var(--color-brand-primary);
}
```

### D-2: Create Button Component
**File:** `src/components/ui/Button.tsx`

Props:
- `variant`: `'primary' | 'secondary' | 'danger' | 'ghost'`
- `size`: `'sm' | 'md' | 'lg'`
- `loading`: boolean (shows spinner, disables click)
- `disabled`: boolean
- `icon`: ReactNode (optional leading icon)
- `as`: `'button' | 'a'` (polymorphic)
- All standard button HTML attributes

Requirements:
- Visible focus ring using `focus-visible:ring-2`
- Loading state shows spinner and disables interaction
- Consistent padding/font-size per size variant
- `aria-disabled` when loading or disabled
- `aria-busy` when loading

### D-3: Create Input Component
**File:** `src/components/ui/Input.tsx`

Props:
- `label`: string (rendered as `<label>` with `htmlFor`)
- `error`: string (rendered as error message below input)
- `helperText`: string (rendered as helper below input)
- All standard input HTML attributes

Requirements:
- Auto-generates matching `id` for label+input association
- Error state changes border color to red
- Visible focus ring
- `aria-invalid` when error is present
- `aria-describedby` pointing to error/helper text

Also create: `Select.tsx`, `Textarea.tsx` following same pattern.

### D-4: Create Modal/Dialog Component
**File:** `src/components/ui/Modal.tsx`

Props:
- `open`: boolean
- `onClose`: () => void
- `title`: string
- `size`: `'sm' | 'md' | 'lg' | 'xl'`
- `children`: ReactNode

Requirements:
- Focus trap (tab cycling within modal)
- Escape key closes modal
- Click outside (backdrop) closes modal
- `role="dialog"` and `aria-modal="true"`
- `aria-labelledby` pointing to title
- Body scroll lock when open
- Enter/exit animation (fade + scale)
- Returns focus to trigger element on close

### D-5: Create Badge Component
**File:** `src/components/ui/Badge.tsx`

Props:
- `variant`: `'default' | 'success' | 'warning' | 'error' | 'info'`
- `size`: `'sm' | 'md'`
- `children`: ReactNode

### D-6: Create Table Components
**File:** `src/components/ui/Table.tsx`

Components: `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell`, `TableHeaderCell`

Requirements:
- Responsive wrapper with `overflow-x-auto`
- Sortable column headers (click to sort, aria-sort attribute)
- Consistent cell padding and text alignment
- Hover state on rows
- Sticky header option

### D-7: Create EmptyState Component
**File:** `src/components/ui/EmptyState.tsx`

Props:
- `icon`: ReactNode
- `title`: string
- `description`: string
- `action`: `{ label: string, onClick: () => void }` (optional CTA button)

Use as the standard pattern for all empty lists/tables.

### D-8: Create Pagination Component
**File:** `src/components/ui/Pagination.tsx`

Props:
- `page`: number
- `totalPages`: number
- `onPageChange`: (page: number) => void

### D-9: Create ConfirmDialog Component
**File:** `src/components/ui/ConfirmDialog.tsx`

Replace all `window.confirm()` usage with styled confirmation modal.
Props:
- `open`: boolean
- `onConfirm`: () => void
- `onCancel`: () => void
- `title`: string
- `message`: string
- `confirmLabel`: string (default "Confirm")
- `variant`: `'danger' | 'default'`

---

## Part B: Responsive Design

### R-1: Mobile Sidebar
**File:** `src/components/layout/Sidebar.tsx`

Rewrite sidebar to be:
- **Desktop (md+):** Fixed `w-64` sidebar (current behavior)
- **Mobile (<md):** Hidden by default, toggled via hamburger button in a top header bar
- When open on mobile: full-height overlay with backdrop, slide-in from left
- Close on navigation (route change)
- Close on Escape key
- Close on backdrop click

### R-2: Add Mobile Header
**File:** `src/components/layout/MobileHeader.tsx`

Create a top bar visible only on mobile (`md:hidden`):
- Hamburger menu button (left)
- App name / logo (center)
- Quick action or user menu (right)

### R-3: Update Root Layout
**File:** `src/app/layout.tsx`
- Make sidebar `hidden md:flex` by default
- Add `MobileHeader` for small screens
- Main content area: `ml-0 md:ml-64`

### R-4: Responsive Tables
Add `overflow-x-auto` wrapper to all data tables:
- `src/app/contacts/page.tsx` — contacts table
- `src/app/signups/page.tsx` — signups table
- `src/app/calls/page.tsx` — calls table
- `src/app/settings/page.tsx` — user management table

Hide lower-priority columns on small screens:
```tsx
<TableCell className="hidden md:table-cell">
  {contact.company}
</TableCell>
```

### R-5: Responsive Grids
Update all fixed grid layouts:
- Dashboard stat cards: `grid-cols-2 md:grid-cols-4` (currently `grid-cols-4`)
- Contact filters: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (currently `grid-cols-4`)
- BDR stats: `grid-cols-2 md:grid-cols-4`
- Settings sections: responsive grid

### R-6: Pipeline Mobile View
**File:** `src/app/pipeline/page.tsx`
- Add a view toggle: Kanban (desktop) vs List (mobile)
- On mobile (`< md`): show a vertical list grouped by stage instead of horizontal columns
- Each stage is a collapsible section

### R-7: Chat Panel Mobile
**File:** `src/components/ui/AiChatPanel.tsx`
- On mobile: `w-full` instead of `w-96`
- Or: show as a bottom sheet instead of side panel
- Add close button visible at top

---

## Part C: Accessibility (WCAG AA)

### A-1: Add ARIA Labels to All Icon-Only Buttons
Search for all `<button>` elements that contain only an icon (Lucide React icons) with no text.
Add `aria-label` describing the action:
```tsx
<button aria-label="Delete contact" onClick={handleDelete}>
  <Trash2 className="w-4 h-4" />
</button>
```

Affected files (all pages with icon buttons):
- Contacts page (select all, delete, edit, etc.)
- Pipeline page (move, archive, etc.)
- Sequences page (clone, delete, etc.)
- Settings page (remove user, etc.)
- Outbound page (campaign actions)
- Queue page (task actions)
- Sidebar (collapse, notifications)

### A-2: Add Role Attributes
- Sidebar `<nav>`: add `aria-label="Main navigation"`
- Modal overlays: add `role="dialog"` and `aria-modal="true"` (handled by Modal component)
- Toast container: add `role="status"` and `aria-live="polite"`
- Tab navigation (settings page): add `role="tablist"`, `role="tab"`, `role="tabpanel"`
- Alert messages: add `role="alert"`
- Search inputs: add `role="search"` on parent form

### A-3: Fix Focus Visibility
Replace all `focus:outline-none` (114 instances) with:
```
focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
```

This shows focus rings for keyboard users while hiding them for mouse users.

### A-4: Add htmlFor to All Labels
Search for all `<label>` elements (91 instances).
For each:
- Add an `id` to the associated `<input>`/`<select>`/`<textarea>`
- Add `htmlFor={id}` to the `<label>`
- Or: wrap the input inside the label element

### A-5: Add Focus Trapping to All Modals/Overlays
Install: `npm install @radix-ui/react-focus-scope` (or implement manually)

Apply focus trapping to:
- Modal component (built in D-4)
- AiChatPanel
- LeadDetailDrawer
- All inline modals in pages (brain editor, import dialog, etc.)

### A-6: Add Escape Key Handling to All Overlays
Every overlay/modal/drawer/panel must close on Escape key:
```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [onClose]);
```

### A-7: Toast Accessibility
**File:** `src/components/ui/Toast.tsx`
- Add `aria-live="polite"` to toast container
- Add `role="status"` to each toast
- Ensure toasts auto-dismiss with sufficient time (5+ seconds)
- Add close button with `aria-label="Dismiss notification"`

### A-8: Color Contrast Audit
Verify WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text):
- `text-gray-400` on `bg-gray-900`: check contrast ratio
- `text-gray-500` on `bg-gray-800`: check contrast ratio (likely fails)
- `text-gray-600` on `bg-gray-900`: likely fails — use `text-gray-400` minimum
- Status badges: ensure colored backgrounds have sufficient contrast with white text

---

## Part D: Onboarding

### O-1: Getting Started Checklist
**File:** `src/components/ui/GettingStartedChecklist.tsx`

Create a dashboard component shown when key metrics are zero:
- [ ] Import your first contacts
- [ ] Configure email sending (SMTP)
- [ ] Add knowledge to the Brain
- [ ] Create your first sequence
- [ ] Send your first campaign

Each item links to the relevant page. Items auto-complete when the user has done them (check via API).

### O-2: Dashboard Empty States
**File:** `src/app/page.tsx`
- Replace disappearing sections (`{data.length > 0 && ...}`) with EmptyState component
- Show "Recent Replies" section always, with empty state when no replies
- Show "Pipeline" section always, with empty state linking to contacts import
- Show "Activity" section always, with helpful message

### O-3: Page-Level Empty States
Add EmptyState component to every list page when data is empty:
- Contacts: "No contacts yet. Import from CSV or add manually." + CTA button
- Sequences: "No sequences yet. Create your first automated outreach." + CTA button
- Campaigns: "No campaigns yet. Launch your first outbound campaign." + CTA button
- Calls: "No calls recorded. Connect Twilio in Settings to get started." + CTA button
- Brain: "No knowledge yet. Add your first content to power AI generation." + CTA button
- Queue: "All caught up! No tasks pending." (already good)

---

## Validation Checklist

- [ ] All shared components render correctly with all variant/size combinations
- [ ] Button loading state shows spinner and prevents double-click
- [ ] Modal traps focus, closes on Escape, returns focus on close
- [ ] App is fully usable on 375px wide viewport (iPhone SE)
- [ ] Sidebar collapses to hamburger menu on mobile
- [ ] Tables scroll horizontally on small screens
- [ ] Pipeline has list view on mobile
- [ ] Screen reader (VoiceOver) can navigate all pages
- [ ] All icon-only buttons announce their purpose
- [ ] Tab key moves through all interactive elements with visible focus ring
- [ ] All form fields have associated labels
- [ ] Toasts are announced by screen readers
- [ ] Color contrast passes WCAG AA (4.5:1 ratio)
- [ ] Getting Started checklist appears on empty dashboard
- [ ] Every list page has a meaningful empty state

---

## New Dependencies

```bash
npm install @radix-ui/react-focus-scope
# Or alternatively: @headlessui/react for accessible modal/dialog primitives
```

## New Files to Create

- `src/components/ui/Button.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/Textarea.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Table.tsx`
- `src/components/ui/EmptyState.tsx`
- `src/components/ui/Pagination.tsx`
- `src/components/ui/ConfirmDialog.tsx`
- `src/components/ui/GettingStartedChecklist.tsx`
- `src/components/layout/MobileHeader.tsx`

## Files to Modify Extensively

- `src/app/globals.css` (design tokens)
- `src/components/layout/Sidebar.tsx` (mobile responsive)
- `src/app/layout.tsx` (mobile layout)
- `src/app/page.tsx` (dashboard empty states, onboarding)
- `src/app/contacts/page.tsx` (use shared components, responsive table)
- `src/app/pipeline/page.tsx` (mobile list view)
- `src/app/settings/page.tsx` (accessible tabs, responsive)
- `src/components/ui/AiChatPanel.tsx` (mobile, focus trap, a11y)
- `src/components/ui/Toast.tsx` (aria-live, role)
- Every page with icon-only buttons (add aria-labels)
- Every file with `focus:outline-none` (~24 files, 114 instances)
- Every file with `<label>` elements (~91 instances need htmlFor)

# Profile selectors

The Edit profile trigger uses an accessible pencil icon button. Profile fields still use the existing private, revision-checked save and do not publish changes.

## Member name

The member name comes from `identity.members.full_name`, managed by a database administrator like `helix_role`. Google supplies the initial name when an account is first created. Migration 003 prevents later logins from replacing the assigned name. It is prepared for deployment and has only been applied to the isolated local test database.

Neither the profile modal nor CV setup offers a name field. The API ignores submitted names for CV save, preview and publication and removes name translations. Existing published versions remain immutable until the member republishes. Name administration is a database operation for now; this change does not add an administrator screen.

## NMBU field of study

The searchable shadcn Popover/Command selector uses a local snapshot of NMBU's public programme catalogue, checked 25 October 2026:

- https://www.nmbu.no/studier
- https://www.nmbu.no/en/studies
- https://www.nmbu.no/api/search/all/study_program?q=&locale=nb
- https://www.nmbu.no/api/search/all/study_program?q=&locale=en

The Norwegian endpoint returned 90 entries. All are covered by 79 distinct English choices in `nmbu-study-fields.ts`, with identical fields across degree levels combined. English catalogue titles are used where provided. The catalogue has no English title for many Norwegian-taught programmes, so those display names are translated into English. They are not represented as official diploma titles. Norwegian names and common Helix-relevant aliases remain searchable.

Existing values outside the catalogue remain available, and merely opening or saving another profile field does not silently replace them. Choosing an option saves its English name. Updating the snapshot requires comparing both language endpoints, retaining coverage of Norwegian-only entries and checking new programme titles.

## Phone country

Country names and calling codes come from `libphonenumber-js/min` and English `Intl.DisplayNames`, including countries that share a calling code. Norway is the default for a number with no international prefix. Existing international numbers identify their country when possible. Pasting a complete international number can switch the country automatically.

Unchanged stored phone strings remain unchanged when another field is edited. Edited numbers use the chosen country, accept national trunk prefixes and are saved in international format. Empty is allowed. Incomplete numbers show an error. The standard library checks possible length; it does not claim to verify phone ownership.

Both selectors compose the official shadcn Command component and the existing Popover/Button components. Search, scrolling, keyboard selection and focus restoration use those primitives. No external lookup runs while a member types.

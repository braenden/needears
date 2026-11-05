-- A comment its author deleted while it had replies. The thread stays, the
-- text goes. Added on its own, since a new enum value cannot be used in the
-- transaction that adds it (20261105120100_tester_fixes.sql uses it).
alter type public.comment_status add value 'withdrawn';

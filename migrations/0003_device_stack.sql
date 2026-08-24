-- 0003: the user's stack choices + generated artifacts (config-as-code).
ALTER TABLE devices ADD COLUMN stack_json TEXT;

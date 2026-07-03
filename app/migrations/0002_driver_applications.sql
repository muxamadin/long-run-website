-- Driver applications submitted from the site's apply form.
CREATE TABLE IF NOT EXISTS driver_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  cdl_class TEXT NOT NULL,
  experience TEXT NOT NULL,
  driving_type TEXT NOT NULL,
  home_base TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Approximate city from the offline geolocation database, stored only with analytics consent and
-- only for Malaysian ranges with a known state. Never a coordinate, never the address.
ALTER TABLE analytics.events ADD COLUMN city text;

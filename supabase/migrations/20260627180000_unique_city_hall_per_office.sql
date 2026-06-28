-- One City Hall building (room) per office — label match is case/whitespace insensitive via TRIM.

CREATE UNIQUE INDEX IF NOT EXISTS office_objects_one_city_hall_per_office_idx
  ON office_objects (office_id)
  WHERE object_type = 'room'
    AND TRIM(BOTH FROM label) = 'City Hall';

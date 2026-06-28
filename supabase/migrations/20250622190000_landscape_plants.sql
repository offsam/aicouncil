ALTER TABLE office_objects DROP CONSTRAINT IF EXISTS office_objects_object_type_check;

ALTER TABLE office_objects ADD CONSTRAINT office_objects_object_type_check
  CHECK (object_type IN ('desk', 'wall', 'door', 'cabinet', 'board', 'room', 'tree', 'bush', 'flower'));

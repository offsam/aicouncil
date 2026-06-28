alter table chamber_archive
  add column if not exists archived_into uuid references chamber_archive(id);

create index if not exists idx_chamber_archive_archived_into on chamber_archive(archived_into);

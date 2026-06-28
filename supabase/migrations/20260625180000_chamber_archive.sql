create table chamber_archive (
  id uuid primary key default gen_random_uuid(),
  entity_registry_id uuid not null references entity_registry(id) on delete cascade,
  type text not null default 'raw' check (type in ('raw', 'summary')),
  content text not null,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create index idx_chamber_archive_entity on chamber_archive(entity_registry_id, created_at desc);

alter table chamber_archive enable row level security;

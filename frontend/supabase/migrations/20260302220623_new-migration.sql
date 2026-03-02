create table models (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  data jsonb not null,
  piece_count int default 0,
  stability_score float default 100,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table models enable row level security;

-- Create policy: Users can only see/edit their own models
create policy "Users can manage their own models" on models
  for all using (auth.uid() = user_id);
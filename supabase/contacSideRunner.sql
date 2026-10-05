create table contact.page(
created_at timestamptz not tull default now(),
full_name text not null,
Email text not null,
message text not null check(char_lenght(message) <250),
)



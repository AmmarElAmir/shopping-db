-- Consolidate overly specific categories into higher-level, room/function
-- based categories (Living Room, Bedroom, Kitchen, Dining, Home Decor,
-- Electronics & Tech, Fashion & Accessories, Baby & Kids). Also drops the
-- unused "Test category" row.

insert into categories (name) values
  ('Living Room'),
  ('Bedroom'),
  ('Kitchen'),
  ('Dining'),
  ('Home Decor'),
  ('Electronics & Tech'),
  ('Fashion & Accessories'),
  ('Baby & Kids')
on conflict (name) do nothing;

update products p
set category_id = nc.id
from categories oc
join (values
  ('Coffee Tables', 'Living Room'),
  ('Floor Lamps', 'Living Room'),
  ('Lounge & Rocking Chairs', 'Living Room'),
  ('Nest of Tables', 'Living Room'),
  ('Ottomans & Poufs', 'Living Room'),
  ('Sofa 3 seater', 'Living Room'),
  ('Sofas & Sofa-Beds', 'Living Room'),
  ('TV Units', 'Living Room'),
  ('Beds', 'Bedroom'),
  ('Chests of Drawers', 'Bedroom'),
  ('Electric Kettles', 'Kitchen'),
  ('Kitchen Cabinets', 'Kitchen'),
  ('Dining Chairs', 'Dining'),
  ('Dining Sets', 'Dining'),
  ('Dining Tables', 'Dining'),
  ('Dinner Sets', 'Dining'),
  ('Carpet', 'Home Decor'),
  ('Rugs', 'Home Decor'),
  ('Vases', 'Home Decor'),
  ('Mechanical Keyboards', 'Electronics & Tech'),
  ('Backpacks & Bags', 'Fashion & Accessories'),
  ('T-Shirts', 'Fashion & Accessories'),
  ('Strollers & Travel Systems', 'Baby & Kids')
) as mapping(old_name, new_name) on mapping.old_name = oc.name
join categories nc on nc.name = mapping.new_name
where p.category_id = oc.id;

delete from categories
where name in (
  'Coffee Tables', 'Floor Lamps', 'Lounge & Rocking Chairs', 'Nest of Tables',
  'Ottomans & Poufs', 'Sofa 3 seater', 'Sofas & Sofa-Beds', 'TV Units',
  'Beds', 'Chests of Drawers', 'Electric Kettles', 'Kitchen Cabinets',
  'Dining Chairs', 'Dining Sets', 'Dining Tables', 'Dinner Sets',
  'Carpet', 'Rugs', 'Vases', 'Mechanical Keyboards',
  'Backpacks & Bags', 'T-Shirts', 'Strollers & Travel Systems',
  'Test category'
);

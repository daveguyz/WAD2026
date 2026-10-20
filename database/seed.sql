-- =====================================================================
--  CampusPulse  |  database/seed.sql
--  Sample data for testing and the system demonstration.
--  Run AFTER schema.sql.
--
--  Demo accounts (passwords are stored as bcrypt hashes):
--    Admin   : admin@nust.na              / Admin@123
--    Student : 200000@nust.na / Student@123
--    Student : 200001@nust.na / Student@123
--    Student : 200002@nust.na / Student@123
--
--  Event dates are relative to NOW() so the demo always has
--  upcoming events, whenever the script is run.
-- =====================================================================

USE campuspulse;

-- Users ---------------------------------------------------------------
INSERT INTO users (full_name, student_number, email, password_hash, faculty, phone, role) VALUES
('System Administrator', NULL,        'admin@nust.na',
 '$2a$10$0Q41NsX7n7cJIc5S.mEcZed5SOAMi5jjh0JNMXbKzTWaPUK0IMi46', 'Student Affairs', '0612072000', 'admin'),
('Ndapewa Shikongo',     '224012345', '200000@nust.na',
 '$2a$10$10LwyP2xrQrW5GlaL.W4HOAhae3LgT1yUemxdKTL1bryg1sY4/A0S', 'Computing and Informatics', '0811234567', 'student'),
('Johannes van Wyk',     '223098765', '200001@nust.na',
 '$2a$10$10LwyP2xrQrW5GlaL.W4HOAhae3LgT1yUemxdKTL1bryg1sY4/A0S', 'Engineering and the Built Environment', '0817654321', 'student'),
('Maria Kandjii',        '225011122', '200002@nust.na',
 '$2a$10$10LwyP2xrQrW5GlaL.W4HOAhae3LgT1yUemxdKTL1bryg1sY4/A0S', 'Commerce, Human Sciences and Education', '0855550101', 'student');

-- Categories ----------------------------------------------------------
INSERT INTO categories (name, description, colour) VALUES
('Academic',      'Workshops, tutorials, guest lectures and study sessions', '#0B3D91'),
('Sports',        'Matches, tournaments, fitness and recreation',           '#0F8A5F'),
('Clubs & Societies', 'Club meetings, open days and society activities',    '#7A3DB8'),
('Careers',       'Career fairs, internships, CV and interview clinics',     '#C2410C'),
('Arts & Culture','Cultural days, music, drama, poetry and exhibitions',     '#BE185D'),
('Tech',          'Hackathons, coding meetups and tech talks',               '#0E7490'),
('Wellness',      'Health, mental wellness and student support sessions',    '#4D7C0F');

-- Venues --------------------------------------------------------------
INSERT INTO venues (name, location, capacity) VALUES
('NUST Main Hall',                  'Main Campus, 13 Jackson Kaujeua Street', 800),
('FCI Computer Lab 1',              'Faculty of Computing and Informatics',     60),
('NUST Sports Field',               'Main Campus Sports Grounds',             1000),
('Library Auditorium',              'NUST Library, Ground Floor',              200),
('Hotel School Conference Room',    'NUST Hotel School',                       120),
('Student Centre Courtyard',        'Student Centre',                          400),
('Engineering Lecture Theatre E1',  'Faculty of Engineering',                  250);

-- Events --------------------------------------------------------------
INSERT INTO events (title, summary, description, category_id, venue_id, organiser_id,
                    start_datetime, end_datetime, capacity, is_free, ticket_price, status) VALUES
('Web Dev Bootcamp: HTML to Hosting',
 'A hands-on afternoon building and deploying your first website.',
 'Join the FCI Developers Club for a practical bootcamp covering semantic HTML, modern CSS layouts with Flexbox and Grid, JavaScript basics, and how to put your site online for free. Bring your laptop. Ideal for first and second year students.',
 6, 2, 2, TIMESTAMP(DATE(NOW() + INTERVAL 4 DAY), '14:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 4 DAY), '17:00:00'),
 60, 1, 0.00, 'approved'),

('Inter-Faculty Football Tournament',
 'Faculties battle it out for the 2026 NUST football trophy.',
 'Eight faculty teams compete in a one-day knockout tournament. Supporters are welcome - wear your faculty colours! Food stalls by the SRC on the day.',
 2, 3, 3, TIMESTAMP(DATE(NOW() + INTERVAL 9 DAY), '08:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 9 DAY), '17:00:00'),
 500, 1, 0.00, 'approved'),

('Career Fair 2026: Meet Namibian Employers',
 'Network with 30+ employers offering internships and graduate posts.',
 'Bring printed CVs and dress professionally. Employers from banking, mining, ICT, telecommunications and the public sector will be present. A CV clinic runs from 09:00 in the Library Auditorium.',
 4, 1, 1, TIMESTAMP(DATE(NOW() + INTERVAL 14 DAY), '09:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 14 DAY), '15:00:00'),
 800, 1, 0.00, 'approved'),

('Cultural Day Celebration',
 'Music, food, traditional attire and performances from across Namibia.',
 'Celebrate the diversity of our campus. Student societies will showcase traditional dance, poetry, fashion and food. Prizes for the best-dressed students.',
 5, 6, 4, TIMESTAMP(DATE(NOW() + INTERVAL 20 DAY), '10:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 20 DAY), '16:00:00'),
 400, 0, 20.00, 'approved'),

('Exam Stress Management Workshop',
 'Practical techniques to stay calm and focused during exams.',
 'Presented by NUST Student Counselling. Learn study planning, breathing techniques and healthy routines for exam season. Confidential one-on-one sessions can be booked afterwards.',
 7, 4, 1, TIMESTAMP(DATE(NOW() + INTERVAL 6 DAY), '12:30:00'), TIMESTAMP(DATE(NOW() + INTERVAL 6 DAY), '13:30:00'),
 150, 1, 0.00, 'approved'),

('Calculus Revision Session',
 'Peer-led revision of limits, derivatives and integrals.',
 'Senior tutors walk through past exam papers step by step. Bring your calculator and questions.',
 1, 7, 2, TIMESTAMP(DATE(NOW() + INTERVAL 3 DAY), '16:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 3 DAY), '18:00:00'),
 200, 1, 0.00, 'approved'),

('NUST Hackathon: Smart Campus',
 '24 hours to build tech that makes campus life better.',
 'Form teams of up to four and build a prototype that solves a real campus problem. Mentors from local tech companies will be on site. Prizes for the top three teams.',
 6, 1, 1, TIMESTAMP(DATE(NOW() + INTERVAL 27 DAY), '09:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 28 DAY), '09:00:00'),
 120, 1, 0.00, 'approved'),

('Chess Club Open Evening',
 'All skill levels welcome - learn, play and join the club.',
 'The NUST Chess Club invites new members to a relaxed evening of casual games and a beginners lesson. Boards provided.',
 3, 5, 3, TIMESTAMP(DATE(NOW() + INTERVAL 11 DAY), '17:30:00'), TIMESTAMP(DATE(NOW() + INTERVAL 11 DAY), '20:00:00'),
 40, 1, 0.00, 'pending'),

('Photography Walk Around Windhoek',
 'Capture the city with the NUST Photography Society.',
 'A guided walk from campus through the CBD. Phones and cameras welcome. Meet at the Student Centre.',
 5, 6, 4, TIMESTAMP(DATE(NOW() + INTERVAL 16 DAY), '07:00:00'), TIMESTAMP(DATE(NOW() + INTERVAL 16 DAY), '10:00:00'),
 25, 0, 30.00, 'pending'),

('Orientation Week Welcome Braai',
 'A relaxed braai to welcome first-year students.',
 'Hosted by the SRC. Meet club representatives and make new friends.',
 3, 6, 1, TIMESTAMP(DATE(NOW() - INTERVAL 30 DAY), '17:00:00'), TIMESTAMP(DATE(NOW() - INTERVAL 30 DAY), '21:00:00'),
 300, 0, 50.00, 'approved');

-- Registrations -------------------------------------------------------
INSERT INTO registrations (user_id, event_id) VALUES
(2, 2), (2, 3), (2, 5),
(3, 1), (3, 3), (3, 6), (3, 7),
(4, 1), (4, 4), (4, 6),
(2, 10), (3, 10);

-- Contact messages ----------------------------------------------------
INSERT INTO contact_messages (user_id, name, email, subject, message, is_read) VALUES
(2, 'Ndapewa Shikongo', '200000@nust.na', 'Suggestion',
 'Could you add a filter for events on the Windhoek CBD satellite campus?', 0),
(NULL, 'Peter Nghipondoka', 'peter.n@example.com', 'Partnership',
 'Our company would like to sponsor the hackathon. Who can we speak to?', 1);

-- =====================================================================
--  CampusPulse  |  cloudflare/d1/seed.sql (Cloudflare D1 / SQLite)
--  Sample data for testing and the system demonstration.
--  Run AFTER cloudflare/d1/schema.sql.
--
--  Demo accounts (passwords are stored as PBKDF2-SHA256 hashes):
--    Admin   : admin@nust.na              / Admin@123
--    Student : 200000@nust.na / Student@123
--    Student : 200001@nust.na / Student@123
--    Student : 200002@nust.na / Student@123
--
--  Event dates are relative to the current date so the demo always has
--  upcoming events, whenever the script is run.
-- =====================================================================


-- Users ---------------------------------------------------------------
INSERT INTO users (full_name, student_number, email, password_hash, faculty, phone, role) VALUES
('System Administrator', NULL,        'admin@nust.na',
 'pbkdf2$100000$Yg0JSw4+DMHirTh8Cc8jKw==$Kb+cy3NVQfBwBaZ7ze7T38osrPH1Zy1kBsBH0VruhJw=', 'Student Affairs', '0612072000', 'admin'),
('Ndapewa Shikongo',     '224012345', '200000@nust.na',
 'pbkdf2$100000$UNyyrxk5QMTAS13elKutNQ==$vvRvN7FO+RoYNpWRC7tsW8U4GiAfdGY1H+VWDoDKIVM=', 'Computing and Informatics', '0811234567', 'student'),
('Johannes van Wyk',     '223098765', '200001@nust.na',
 'pbkdf2$100000$UNyyrxk5QMTAS13elKutNQ==$vvRvN7FO+RoYNpWRC7tsW8U4GiAfdGY1H+VWDoDKIVM=', 'Engineering and the Built Environment', '0817654321', 'student'),
('Maria Kandjii',        '225011122', '200002@nust.na',
 'pbkdf2$100000$UNyyrxk5QMTAS13elKutNQ==$vvRvN7FO+RoYNpWRC7tsW8U4GiAfdGY1H+VWDoDKIVM=', 'Commerce, Human Sciences and Education', '0855550101', 'student');

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
 6, 2, 2, (date('now','+2 hours','+4 days') || ' 14:00:00'), (date('now','+2 hours','+4 days') || ' 17:00:00'),
 60, 1, 0.00, 'approved'),

('Inter-Faculty Football Tournament',
 'Faculties battle it out for the 2026 NUST football trophy.',
 'Eight faculty teams compete in a one-day knockout tournament. Supporters are welcome - wear your faculty colours! Food stalls by the SRC on the day.',
 2, 3, 3, (date('now','+2 hours','+9 days') || ' 08:00:00'), (date('now','+2 hours','+9 days') || ' 17:00:00'),
 500, 1, 0.00, 'approved'),

('Career Fair 2026: Meet Namibian Employers',
 'Network with 30+ employers offering internships and graduate posts.',
 'Bring printed CVs and dress professionally. Employers from banking, mining, ICT, telecommunications and the public sector will be present. A CV clinic runs from 09:00 in the Library Auditorium.',
 4, 1, 1, (date('now','+2 hours','+14 days') || ' 09:00:00'), (date('now','+2 hours','+14 days') || ' 15:00:00'),
 800, 1, 0.00, 'approved'),

('Cultural Day Celebration',
 'Music, food, traditional attire and performances from across Namibia.',
 'Celebrate the diversity of our campus. Student societies will showcase traditional dance, poetry, fashion and food. Prizes for the best-dressed students.',
 5, 6, 4, (date('now','+2 hours','+20 days') || ' 10:00:00'), (date('now','+2 hours','+20 days') || ' 16:00:00'),
 400, 0, 20.00, 'approved'),

('Exam Stress Management Workshop',
 'Practical techniques to stay calm and focused during exams.',
 'Presented by NUST Student Counselling. Learn study planning, breathing techniques and healthy routines for exam season. Confidential one-on-one sessions can be booked afterwards.',
 7, 4, 1, (date('now','+2 hours','+6 days') || ' 12:30:00'), (date('now','+2 hours','+6 days') || ' 13:30:00'),
 150, 1, 0.00, 'approved'),

('Calculus Revision Session',
 'Peer-led revision of limits, derivatives and integrals.',
 'Senior tutors walk through past exam papers step by step. Bring your calculator and questions.',
 1, 7, 2, (date('now','+2 hours','+3 days') || ' 16:00:00'), (date('now','+2 hours','+3 days') || ' 18:00:00'),
 200, 1, 0.00, 'approved'),

('NUST Hackathon: Smart Campus',
 '24 hours to build tech that makes campus life better.',
 'Form teams of up to four and build a prototype that solves a real campus problem. Mentors from local tech companies will be on site. Prizes for the top three teams.',
 6, 1, 1, (date('now','+2 hours','+27 days') || ' 09:00:00'), (date('now','+2 hours','+28 days') || ' 09:00:00'),
 120, 1, 0.00, 'approved'),

('Chess Club Open Evening',
 'All skill levels welcome - learn, play and join the club.',
 'The NUST Chess Club invites new members to a relaxed evening of casual games and a beginners lesson. Boards provided.',
 3, 5, 3, (date('now','+2 hours','+11 days') || ' 17:30:00'), (date('now','+2 hours','+11 days') || ' 20:00:00'),
 40, 1, 0.00, 'pending'),

('Photography Walk Around Windhoek',
 'Capture the city with the NUST Photography Society.',
 'A guided walk from campus through the CBD. Phones and cameras welcome. Meet at the Student Centre.',
 5, 6, 4, (date('now','+2 hours','+16 days') || ' 07:00:00'), (date('now','+2 hours','+16 days') || ' 10:00:00'),
 25, 0, 30.00, 'pending'),

('Orientation Week Welcome Braai',
 'A relaxed braai to welcome first-year students.',
 'Hosted by the SRC. Meet club representatives and make new friends.',
 3, 6, 1, (date('now','+2 hours','-30 days') || ' 17:00:00'), (date('now','+2 hours','-30 days') || ' 21:00:00'),
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

-- Server-side upload limits. The app shrinks photos to small JPEGs before upload, so
-- these only stop uploads that bypass the app.
update storage.buckets
   set file_size_limit = 1048576,            -- 1 MB
       allowed_mime_types = array['image/jpeg']
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 5242880,            -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'bills';

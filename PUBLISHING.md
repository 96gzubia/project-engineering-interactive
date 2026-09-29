# Publish from Lecture Studio

Lecture Studio (`96gzubia/edit`) and the student app have separate responsibilities. Export HTML and Prepare publishing handoff only download files. Neither action changes GitHub, the catalog, or `latest`. No token is stored in the editor.

## Editor-controlled handoff

1. Apply edits and test the working lecture in Lecture Studio. Choose **Prepare publishing handoff** and enter the stable lecture ID, number, student-facing title, and course. Save the `.lecture-publish.json` outside the repository.
2. In a clean, up-to-date local checkout of `96gzubia/project-engineering-interactive`, validate it (Python 3.10+ and Node.js required):

   ```sh
   git pull --ff-only
   python3 scripts/publish-lecture.py ~/Downloads/pm-mii-02.lecture-publish.json
   ```

   This is a read-only preview. It validates the HTML and prints the exact catalog entry and latest pointer. Review these and test interactive behavior using the editor preview.
3. Publish explicitly, optionally making this lecture latest:

   ```sh
   python3 scripts/publish-lecture.py ~/Downloads/pm-mii-02.lecture-publish.json --publish --make-latest
   git show --stat
   git push
   ```

   Omit `--make-latest` to add a lecture without promotion. Add `--replace` only when intentionally revising an existing ID. The command commits both the HTML and catalog together after smoke checks. `git push` deploys through the existing branch-based Pages workflow; there is no second deployment workflow or automatic export trigger.

New IDs map to `lectures/<id>.html`, independent of title, date, or export name. Existing IDs retain their existing file path, including `pm-mii-01`. Existing catalog entries and extra metadata are retained. The handoff never supplies a filesystem path or a latest instruction. The legacy lecture redirect, app shell, manifest, and service worker are not modified.

Checks cover the versioned export marker, SHA-256 integrity, unique screen IDs, complete edited route, embedded slide images, JavaScript syntax, existing lecture files, and required app components. Unresolved relative media URLs are rejected. External HTTPS media can still require a network connection. These lightweight checks do not prove that every simulation works: preview the lecture before publishing.

Failed validation writes nothing. A failure during staging or committing restores the previous HTML and catalog. A clean working tree is required. No push is performed by the script. To undo an already pushed publication, revert its publication commit and push the revert; this restores its catalog and lecture changes together.

Run regression smoke tests with `python3 -m unittest discover -s tests`.

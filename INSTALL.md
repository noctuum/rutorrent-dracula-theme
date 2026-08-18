### [ruTorrent](https://github.com/Novik/ruTorrent)

#### Install using Git

If you are a Git user, you can install the theme and keep it up to date by cloning the repo:

```bash
git clone https://github.com/noctuum/rutorrent-dracula-theme.git
```

#### Install manually

Download [`Dracula.tar.gz`](https://github.com/noctuum/rutorrent-dracula-theme/releases/latest/download/Dracula.tar.gz) from the latest release and unpack it.

#### Activating theme

1. Copy the `Dracula` folder into your ruTorrent themes directory:

   ```bash
   cp -r Dracula /path/to/ruTorrent/plugins/theme/themes/
   ```

2. Open ruTorrent in your browser.
3. Click the **Settings** button (gear icon) in the toolbar.
4. On the **General** page, find **Theme** beside the language selector.
5. Select **Dracula** from the dropdown list.
6. Click **OK** to apply.
7. Reload the page. ✨

#### Updating an installed theme

Copy the `Dracula` folder over the old one and reload. If nothing looks
different, the browser is still serving the stylesheets it already had:
ruTorrent versions them by _its own_ release, so the URL does not change when
the theme does, and a hard reload will not always fetch them. Open ruTorrent in
a private window, or clear the cache for the site.

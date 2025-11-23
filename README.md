# Homebox Home Assistant Add-on

<img src="https://raw.githubusercontent.com/Oddiesea/homebox-ingress-ha-addon/main/homebox/icon.png" alt="Homebox Icon" width="64" height="64">

A Home Assistant add-on for [Homebox](https://github.com/sysadminsmedia/homebox), an inventory and organization system built for the Home User.

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https://github.com/Oddiesea/homebox-ingress-ha-addon)

## Features

- **Ingress Support** - Secure access through Home Assistant's built-in ingress feature
- **Multi-Architecture** - Supports amd64 and aarch64 (arm64) architectures
- **Automatic Updates** - Built from the latest Homebox source on each build

## Installation

1. Add this repository to your Home Assistant add-on store:
   - Go to **Supervisor** → **Add-on Store** → **Repositories**
   - Add this URL: `https://github.com/Oddiesea/homebox-ingress-ha-addon`
   - Click **Add**

2. Install the Homebox add-on:
   - Navigate to the add-on store
   - Find **Homebox** in the list
   - Click **Install**
   - Wait for the installation to complete

3. Start the add-on:
   - Click **Start** in the add-on page
   - The add-on will start Homebox

4. Access Homebox:
   - Click **OPEN WEB UI** in the add-on page OR enable in the sidebar
   - Homebox will open and be accessible through Home Assistant's ingress feature

## Configuration

The add-on uses the default Homebox configuration. All data is stored in `/config/homebox/` within your Home Assistant configuration directory.

## Support

- **Homebox Project**: [https://github.com/sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox)
- **Issues**: Please report issues with this add-on on the [GitHub Issues](https://github.com/Oddiesea/homebox-ingress-ha-addon/issues) page

## License

This add-on is licensed under the AGPL-3.0 license, the same as Homebox itself.

## Credits

- Homebox is developed by [sysadminsmedia](https://github.com/sysadminsmedia/homebox)


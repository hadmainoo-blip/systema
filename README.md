# No Coin Pilot

Version **0.3.0** targets [Ashuni Legacy San Francisco](https://ashuni.lol/legacy/sanfrancisco/).

[Download the extension ZIP](https://github.com/hadmainoo-blip/systema/raw/refs/heads/main/no-coin-pilot.zip)

Extract it, open `chrome://extensions`, enable Developer mode, and **Load unpacked** → select `extension`. For an update, replace the extracted files and click **Reload**. Close the popup before playing.

- **Alt+Shift+P** starts/stops the bot; it can wait on the game menu.
- **Alt+Shift+O** observes without movement.
- **Esc** or **Alt+Shift+X** stops.

The native backend reads actual coin/collider state and uses precision lateral steering, jumping and rolling. Auto-brake pauses for manual takeover when predicted danger remains unresolved. Collision and coin pickup remain active.

Live tests achieved zero-coin segments; a no-brake run reached world Z 2,100 and subsequently died. Perfect or endless runs are not guaranteed. The default configuration can pause rather than continue into an unresolved hazard.

[Setup and settings](subway-no-coin/README.md) · [Validation and limitations](subway-no-coin/VALIDATION.md) · [Build analysis](subway-no-coin/SOURCE-ANALYSIS.md)

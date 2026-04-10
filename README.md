# EV Charging Tracker

EV Charging Tracker helps teams share office EV chargers without confusion.

It shows charger availability in real time, lets people claim or release a spot, and manages a simple waitlist when chargers are full.

## What You Can Do

- See all charger spots and their live status.
- Claim an available spot for a selected time range.
- Release your spot when you are done.
- Join the waitlist and track your queue position.
- View spot details from the map or list.
- Use mobile view with a map-first layout and collapsible drawer.

## How To Use

1. Enter your name on the login screen.
2. Tap an available charger and claim it.
3. Pick start and end time, then confirm.
4. If no spots are available, join the waitlist.
5. Release your spot when you leave so others can charge.

## Waitlist Rules

- You cannot be on the waitlist while actively charging.
- If you claim a spot, your waitlist entry is removed automatically.
- Waitlist order is first in, first out.

## Admin Mode

Admins can unlock extra controls to keep the lot organized:

- Mark chargers under maintenance or back in service.
- Remove a user from an occupied spot.
- Remove users from waitlist.
- Release a spot and auto-assign the next waitlist user when possible.

Admin actions are verified through secure backend routes.

## Daily Auto-Release

To prevent forgotten active spots overnight, the app supports an automatic daily reset that releases all occupied spots.

- Target time: 12:00 AM Vancouver time (`America/Vancouver`).
- Cron strategy: runs hourly, then executes only when Vancouver local hour is `00` (handles DST).
- Endpoint: `/api/daily-reset`
- Security: requires `CRON_SECRET` (Bearer token header).

If you use Vercel, set `CRON_SECRET` in project environment variables so the scheduled call is authorized.

## Mobile Experience

- Main view is the charger visual map.
- Legend and Join Waitlist stay visible under the map.
- A bottom tab opens a draggable drawer for Spots and Waitlist lists.

## Common Questions

### Why do I see “until unspecified”?

The waitlist or occupancy entry is missing a valid end time value. Rejoin or update the entry with a proper time.

### Why can I not join waitlist while charging?

This is intentional to keep queue behavior fair and avoid duplicate allocation states.

### I released a spot as admin but no one was auto-assigned

Auto-assignment only happens when a valid next waitlist user exists and the row has required owner information.

## Quick Start For Maintainers

If you are running this project locally:

1. Install dependencies with npm install.
2. Copy .env.example to .env.local.
3. Fill required environment variables.
4. Start with npm run dev.

Useful scripts:

- npm run dev
- npm run build
- npm run preview
- npm run lint

## License

Add your preferred license information here.

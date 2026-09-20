# Decisions

## What did the assignment not tell you?

- The API shape. The brief does not say what JSON the API should return. I chose `{ from, to, weeks, people }`. `weeks` is a list of week start dates, all Mondays. Each person has `id`, `name`, `weeklyHours`, and `allocations`. Each number in `allocations` matches the same position in `weeks`.

- What a week is. I count a week as Monday to Sunday. The default range in the starter begins on a Monday and covers three full weeks, which looked like the intended meaning.

- What `hours_per_day` means. The name says hours, but the numbers are all eighths like 0.125 and 0.5, which look like part of a day. I checked the data first: the busiest people add up to exactly 40 hours a week, and 180 of 500 people are over their weekly hours at some point. So the simple meaning is right, and it shows real over-allocation.

- Working days or all days. An assignment only counts Monday to Friday. Some assignments go over a weekend (for example January 9 to January 12). If I counted weekends too, those weeks would be wrong. So I break each assignment into its days and keep only weekdays.

- Capacity does not change. A person's capacity is their `weekly_hours`, the same every week. The data has no start or leave dates, so there is no reason to change a person's capacity for part of a week.

- What happens after an edit. When a manager changes a person's hours, the grid updates that person's `weeklyHours` in its own state. It does not reload the whole range. Allocations come from `assignments`, and changing `weekly_hours` does not touch them. So only the capacity part and which cells turn red change. Updating in place is exact and avoids a reload.

- Zero capacity. One person has `weekly_hours = 0`. Any allocation on top of zero is over-allocated. I compare `allocated > capacity` directly, which also avoids dividing by zero.

## What did you notice that looked wrong?

- The data is much bigger than it looks at first. The first ten assignments are carefully made test cases (part of a week, over a weekend, zero capacity), but the real data has 500 people and about 126,000 assignments over 19 months.

- The third week of the default window is almost empty. Only four people have work in the week of January 12, because the data ends around there. It looked like a bug at first, but it is just the shape of the data, and it is why that window is a good demo.

- Rounding. My first query rounded allocations to three decimals, but some inputs are sixteenths like 0.3125. I checked and found every weekly total is already a clean number, so the rounding never changed anything. I removed it anyway so the code returns exact values.

## What did the AI get wrong that you caught?

- The AI's first version drew the editable weekly hours as faded plain text with no sign that it was clickable. I had to click around the person column to find that the weekly hours number opened an editor, which a manager would never notice. I had it add a dashed underline and a small pencil icon. I also caught a layout bug where the cell was two lines when read-only but one line while editing, and had that fixed.

## What would you do differently with a week?

- Add tests. Unit tests for how the weekdays and weeks are counted, and tests for both endpoints, so the math is checked by code instead of by hand.

- Count weekdays with a formula instead of breaking every assignment into its days. Breaking it apart is clear and fast here (the full range answers in about 0.2 seconds), but a formula would handle a much bigger team better.

- Make editing nicer: show the change right away and undo it if the save fails, and add a line showing how many people are over-allocated.

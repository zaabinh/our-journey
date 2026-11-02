# Task 1:
Commit current changes with the ordered and logical commit messages and history

# Task 2:
Act as a Senior UI/UX Frontend Engineer. Refactor the 3 feature cards (01, 02, 03) on the Landing Page in our repository (zaabinh/our-journey) so they clearly communicate product features rather than looking like plain numbered steps.

---

### Detailed Requirements

#### 1. Redesign Feature Numbers (01, 02, 03)
- Remove the small dark solid pill badges currently wrapping the numbers.
- Style the numbers `01`, `02`, `03` using the same elegant Serif / tracking styling as the "OUR JOURNEY" sub-badge:
  - Font: Serif typography (matching the "OUR JOURNEY" subtitle), uppercase, tracking-wider/tracking-widest.
  - Sizing & Color: Styled prominently (e.g., `text-xl` or `text-2xl`, semi-bold) in a refined deep wine or rose accent color (`#7A2238` or `text-rose-900/80`), positioned cleanly at the top header of each card.

#### 2. Add Feature Icons (Enhance Feature Identity)
Add a themed Lucide/SVG icon to each card header next to or above the number to immediately convey the functionality:
- **Card 01 ("Một nơi cho mọi câu chuyện")**: Book / Journal / Album icon (e.g., `BookHeart` or `FolderHeart`).
- **Card 02 ("Ảnh đi cùng ký ức")**: Camera / Gallery icon (e.g., `Camera` or `ImagePlus`).
- **Card 03 ("Dễ tìm lại khi cần")**: Search / Sparkle filter icon (e.g., `Sparkles` or `SearchHeart`).
- Style the icons inside a soft pastel rounded container (`w-10 h-10 rounded-xl bg-rose-100/70 text-rose-800 flex items-center justify-center`).

#### 3. Card Typography & Visual Hierarchy
- **Header row**: Align the Icon and the Serif Number `01/02/03` gracefully on the top row (e.g., flex justify-between or icon followed by the number).
- **Title**: Increase contrast and prominence (`text-lg font-semibold text-rose-950 mt-3`).
- **Description**: Keep legible, clean copy with slightly more line-height (`text-sm leading-relaxed text-stone-600 mt-1`).
- **Interaction**: Add subtle hover micro-interaction (`hover:-translate-y-1 hover:shadow-lg hover:border-rose-200 transition-all duration-300`).

---

### Expected Output
- Clean component diffs updating the 3 feature cards layout, typography, and icon integration.
- Ensure responsive spacing looks balanced across mobile and desktop.

# Task 3:

Act as a Senior Frontend Engineer. I want to replace all default/blank loading states with polished, theme-matching Skeleton Loading screens for the Album List and Memory Detail pages in our repository (zaabinh/our-journey).

---

### Design & Aesthetic Guidelines
- **Theme Matching**: Do NOT use cold, generic gray skeletons. Match our warm, romantic aesthetic by using soft warm/blush tones (e.g., `bg-rose-100/60` transitioning to `bg-rose-200/50` or warm cream `bg-[#F5ECEB]`).
- **Semantic Shapes**: Skeletons must accurately mirror the real layout (aspect ratio of photo cards, avatar circles, title bars, and badges) to prevent Layout Shift (CLS) when real data loads.
- **Animation**: Use smooth shimmer / pulsing animation (`animate-pulse` or a CSS gradient shimmer sweep).

---

### Implementation Scope

#### 1. Reusable Skeleton Primitives
Create or provide flexible skeleton helper components:
- `<Skeleton className="..." />`: Base component supporting custom widths, heights, border-radii, and the themed warm pulse effect.

#### 2. Album List & Memory Grid Skeleton (`MemoryCardSkeleton`)
Mock the memory card component:
- **Card Container**: Rounded card (`rounded-2xl`) with matching background/border.
- **Image Placeholder**: Top cover image area with fixed aspect ratio (`aspect-[4/3]` or `h-52`), matching border radius.
- **Content Area**:
  - Title placeholder: A wide text bar (`h-6 w-3/4 rounded-md`).
  - Date & Heart badge placeholder: A short text bar (`h-4 w-1/3 rounded-md mt-2`).
  - Body snippet lines: 2 text bars (`h-3.5 w-full rounded-md mt-3` and `h-3.5 w-4/5 rounded-md mt-1.5`).
  - Footer metadata: Pill badges (`h-4 w-1/4 rounded-md mt-4`).
- **Grid View**: Render a responsive grid of 4–6 skeleton cards while fetching albums/memories.

#### 3. Memory Detail Page Skeleton (`MemoryDetailSkeleton`)
Accurately mock the memory detail view:
- **Header Section**: Back button, category badge, and action buttons placeholder.
- **Title & Date**: Large title bar (`h-8 w-1/2`) and subtitle (`h-4 w-1/4`).
- **Moments / Photos Section**:
  - Two photo placeholder frames side-by-side with equal heights / aspect ratios (`rounded-xl`).
- **Reactions Bar**: Row of small circular skeleton avatars/emojis (`w-8 h-8 rounded-full`).
- **Story / Story Text Card**: 3–4 paragraph-length text skeletons.
- **Comments Section**:
  - Avatar circle (`w-9 h-9 rounded-full`) + comment bubble shape.
  - Input box placeholder.

#### 4. Page Integration
- Integrate the skeleton states into the data-fetching logic (e.g., React Query, SWR, or `isLoading` state flags) on:
  - The Album / Memories gallery page.
  - The individual Memory detail route.
- Ensure seamless cross-fade or smooth replacement when real data finishes loading.

---

### Output Expected
1. Reusable skeleton components and page-specific skeleton layouts.
2. Clean code diffs showing the loading state wiring in the relevant page components.
3. Verification that responsive layouts remain intact on both mobile and desktop screens.


# Task 4:
Act as a Senior Frontend Engineer. Fix the broken layout and modernize the User Profile page in the repository (zaabinh/our-journey).

---

### Key Issues & Fixes:

#### 1. Fix Giant Avatar Container
- **Problem**: The avatar image is excessively oversized, pushing the entire form below the fold and overflowing.
- **Fix**: 
  - Restrict the avatar to a standard compact dimension: `width: 112px; height: 112px` (or `w-28 h-28`), `rounded-full`, and `object-fit: cover`.
  - Add a subtle ring and shadow (`ring-4 ring-rose-100 shadow-sm`).

#### 2. Redesign Avatar Action Controls
- Replace the raw browser `<input type="file" />` with a polished UI:
  - Hide the native file input and trigger it via a sleek "Đổi ảnh đại diện" button or a floating camera icon badge over the avatar.
  - Place a secondary subtle "Xóa ảnh" action button next to it (display only when an avatar exists).

#### 3. Form Layout & Fields Polish
- Restructure the profile card into a balanced, centered card (`max-w-xl` or `max-w-2xl` on desktop):
  - Top: Centered avatar with image actions.
  - Form Fields:
    - **Tên hiển thị**: Clean text input with clear focus state matching brand theme.
    - **Email (Read-only)**: Set `readOnly`/`disabled` with background `#F9FAFB`, text muted, and an optional small lock icon to visually signal that it cannot be edited here.
  - **Submit Button ("Lưu hồ sơ")**: Align right or full-width with proper padding (`px-6 py-2.5`), primary brand wine button styling (`#4A1220` or similar), and hover states.

---

### Expected Output:
- Clean updated component and styling diffs ensuring responsive layout on both desktop and mobile screens.

NOTE: After each task, perform git commit and ensure clean commit history, avoid conflict
"""E2E: login → armario → subir prenda con imagen → eliminar."""
import asyncio
import io
import os
import time
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-flow"
SCREENS.mkdir(parents=True, exist_ok=True)

EMAIL = os.environ["TEST_EMAIL"]
PASSWORD = os.environ["TEST_PASSWORD"]

# Minimal valid PNG (1x1 red) written to disk for the file input.
PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-item.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

ITEM_NAME = f"E2E Camiseta {int(time.time())}"


async def login(page):
    await page.goto(f"{BASE}/auth", wait_until="networkidle")
    # Ensure React has hydrated before clicking submit — otherwise the form
    # falls through to a native GET and no session is created.
    await page.wait_for_function(
        "() => !!document.querySelector('form') && !document.querySelector('button[type=submit]')?.disabled",
        timeout=10000,
    )
    await page.get_by_label("Email").fill(EMAIL)
    await page.get_by_label("Contraseña").fill(PASSWORD)
    await page.wait_for_timeout(300)
    await page.get_by_role("button", name="Entrar").click()
    await page.wait_for_function(
        "() => Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'))",
        timeout=15000,
    )




async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
        # Auto-confirm the delete window.confirm
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        # 1) Login
        await login(page)
        await page.screenshot(path=str(SCREENS / "1_after_login.png"))
        print("logged in, url:", page.url)

        # 2) Go to wardrobe
        await page.goto(f"{BASE}/wardrobe", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SCREENS / "2_wardrobe_before.png"))
        # Count existing items (link cards to /wardrobe/<uuid>)
        before = await page.locator('a[href^="/wardrobe/"]:not([href="/wardrobe/add"])').count()
        print("items before:", before)

        # 3) Open add form
        await page.get_by_label("Añadir prenda").first.click()
        await page.wait_for_url("**/wardrobe/add")
        await page.screenshot(path=str(SCREENS / "3_add_form.png"))

        # 4) Upload image via hidden file input
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        # Preview should replace the picker placeholder
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)
        # Filename+size hint should appear (no error)
        await expect(page.get_by_text("wiw-e2e-item.png", exact=False)).to_be_visible()
        await page.screenshot(path=str(SCREENS / "4_image_preview.png"))

        # 5) Fill name and submit
        await page.get_by_label("Nombre").fill(ITEM_NAME)
        await page.wait_for_timeout(200)
        await page.get_by_role("button", name=lambda n: "Guardar" in n).click()
        try:
            await page.wait_for_url("**/wardrobe", timeout=20000)
        except Exception:
            await page.screenshot(path=str(SCREENS / "5_error_state.png"))
            print("URL now:", page.url)
            for e in errors[-20:]:
                print(" •", e)
            raise
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SCREENS / "5_wardrobe_after_add.png"))


        after = await page.locator('a[href^="/wardrobe/"]:not([href="/wardrobe/add"])').count()
        print("items after add:", after)
        assert after == before + 1, f"expected {before+1} items, got {after}"

        # 6) Open the item detail (first card is newest by created_at desc)
        card = page.locator('a[href^="/wardrobe/"]:not([href="/wardrobe/add"])').first
        item_href = await card.get_attribute("href")
        print("opening", item_href)
        await card.click()
        await page.wait_for_url(f"**{item_href}")
        # Confirm the name we set is on the detail page
        await expect(page.get_by_role("heading", name=ITEM_NAME)).to_be_visible(timeout=5000)
        await page.screenshot(path=str(SCREENS / "6_item_detail.png"))

        # 7) Delete (dialog auto-accepted above)
        await page.get_by_label("Eliminar").click()
        await page.wait_for_url("**/wardrobe", timeout=15000)
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SCREENS / "7_wardrobe_after_delete.png"))
        final = await page.locator('a[href^="/wardrobe/"]:not([href="/wardrobe/add"])').count()
        print("items after delete:", final)
        assert final == before, f"expected {before} items after delete, got {final}"

        if errors:
            print("BROWSER ERRORS:")
            for e in errors:
                print(" -", e)

        print("OK: full wardrobe flow passed")
        await browser.close()


asyncio.run(main())

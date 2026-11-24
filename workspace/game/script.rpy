# Create Spooky Haunted Mansion Mystery Story — Generated autonomously by Coding Monster AI + Ren'Py Engine
# Prompt: create a spooky haunted mansion mystery story game with thunder door sfx

define selene = Character("Selene", color="#f43f5e")
define victor = Character("Victor", color="#94a3b8")

image bg scene_one = "images/bg_opening.webp"
image bg scene_two = "images/bg_climax.webp"
image selene neutral = "images/char_selene.png"
image victor neutral = "images/char_victor.png"
image item emblem = "images/item_emblem.svg"

default trust = 0
default courage = 0

label start:
    play music "audio/bgm_main.wav" fadein 1.2 loop
    scene bg scene_one with fade
    "Create Spooky Haunted Mansion Mystery Story — Story initialized from your prompt."
    play sound "audio/sfx_thunder_boom.mp3"
    show selene neutral at left with dissolve
    voice "audio/voice_intro.mp3"
    selene "Did you hear that? Nobody has stepped inside these halls for twenty years... until tonight."
    show victor neutral at right with dissolve
    voice "audio/voice_reply.wav"
    victor "Keep the lantern raised and trust nothing in the shadows. Follow my lead."

    menu:
        "How do you respond to Selene and Victor?"
        "Trust Selene and inspect closely (+Trust)":
            $ trust += 2
            play sound "audio/sfx_door_open.mp3"
            selene "I knew I could count on you. Look closely at what awaits ahead."
            jump inner_chamber
        "Charge boldly through the hazard alone (+Courage)":
            $ courage += 2
            play sound "audio/sfx_thunder_boom.mp3"
            with vpunch
            victor "Careful! That triggered a sudden shockwave!"
            jump inner_chamber

label inner_chamber:
    scene bg scene_two with dissolve
    play sound "audio/sfx_door_open.mp3"
    show selene neutral at left with dissolve
    show victor neutral at right with dissolve
    show item emblem at center with dissolve
    "Discovered Key Story Relic!"
    "Inside the heart of the scene, every clue aligns with your earlier choice (Trust=[trust], Courage=[courage])."

    if trust >= 2:
        selene "Our alliance held steady. Together, we uncovered the true secret behind everything."
        jump ending_true
    else:
        victor "Pure nerve got us through the storm, even if the chamber barely survived it!"
        jump ending_bold

label ending_true:
    scene bg scene_two with fade
    play sound "audio/sfx_thunder_boom.mp3"
    "TRUE ENDING — Harmony & Mastery unlocked for Create Spooky Haunted Mansion Mystery Story."
    stop music fadeout 1.5
    return

label ending_bold:
    scene bg scene_one with fade
    play sound "audio/sfx_door_open.mp3"
    with hpunch
    "BOLD ENDING — You forged an unstoppable path through Create Spooky Haunted Mansion Mystery Story."
    stop music fadeout 1.5
    return

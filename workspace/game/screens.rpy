# Minimal Ren'Py Screens Definition
init offset = -1
screen say(who, what):
    window id "window":
        if who is not None:
            window id "namebox":
                text who id "who"
        text what id "what"

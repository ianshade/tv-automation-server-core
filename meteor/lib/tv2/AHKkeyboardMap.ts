import * as _ from 'underscore'

export const AHKKeyboardMap = {
	'f1': '{F1}',
	'f2': '{F2}',
	'f3': '{F3}',
	'f4': '{F4}',
	'f5': '{F5}',
	'f6': '{F6}',
	'f7': '{F7}',
	'f8': '{F8}',
	'f9': '{F9}',
	'f10': '{F10}',
	'f11': '{F11}',
	'f12': '{F12}',
	'!': '{!}',
	'#': '{#}',
	'add': '{+}',
	'comma': ',',
	'^': '{^}',
	'{': '{}}',
	'}': '{}}',
	'enter': '{Enter}',
	'esc': '{Escape}',
	'space': '{Space}',
	'tab': '{Tab}',
	'backspace': '{Backspace}',
	'del': '{Delete}',
	'ins': '{Insert}',
	'up': '{Up}',
	'down': '{Down}',
	'left': '{Left}',
	'right': '{Right}',
	'home': '{Home}',
	'end': '{End}',
	'pageup': '{PgUp}',
	'pagedown': '{PgDn}',
	'capslock': '{CapsLock}',
	'numlock': '{NumLock}',
	'scrolllock': '{ScrollLock}',
	'num0': '{Numpad0}',
	'num1': '{Numpad1}',
	'num2': '{Numpad2}',
	'num3': '{Numpad3}',
	'num4': '{Numpad4}',
	'num5': '{Numpad5}',
	'num6': '{Numpad6}',
	'num7': '{Numpad7}',
	'num8': '{Numpad8}',
	'num9': '{Numpad9}',
	'numadd': '{NumpadAdd}',
	'numsub': '{NumpadSub}',
	'nummul': '{NumpadMult}',
	'numdiv': '{NumpadDiv}',
}

export const AHKModifierMap = {
	'ctrl': '^',
	'shift': '+',
	'alt': '!',
	'cmd': '#'
}

export const AHKBaseHeader = [
	'#NoEnv',
	'SendMode Input',
	'SetWorkingDir %A_ScriptDir%',
	'',
	'#IfWinActive, ahk_class Chrome_WidgetWin_1',
	''
]

export const useAHKComboTemplate = _.template('<%=platformKeyCombo%> up:: send <%=browserKeyCombo%>')
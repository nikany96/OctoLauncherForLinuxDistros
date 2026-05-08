import { useEffect } from 'react';

const allowedElements = ['INPUT', 'TEXTAREA'];

const usePreventDefaultEvents = () => {
	useEffect(() => {
		const disableKeyboardEvents = (e: KeyboardEvent) => {
			if (allowedElements.includes((e.target as HTMLElement).tagName)) return;
			e.preventDefault();
		};

		const disableFocus = (e: FocusEvent) => {
			if (allowedElements.includes((e.target as HTMLElement).tagName)) return;
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
			e.preventDefault();
		};

		window.addEventListener('keydown', disableKeyboardEvents, true);
		window.addEventListener('keyup', disableKeyboardEvents, true);
		window.addEventListener('focusin', disableFocus, true);

		return () => {
			window.removeEventListener('keydown', disableKeyboardEvents, true);
			window.removeEventListener('keyup', disableKeyboardEvents, true);
			window.removeEventListener('focusin', disableFocus, true);
		};
	}, []);
};

export default usePreventDefaultEvents;

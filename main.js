/**
 * @author Austin Jenchi
 * CSE 154 AQ 19sp
 * @date 04-18-2019
 * Javascript to control the functionality of the paint applications.
 * Adds interactivity to the canvas so that it can be drawn on, as well as the
 * buttons for changing the status of the drawing tool. Keeps track of undo and redo,
 * as well as individual strokes so that they can be removed and redone in order.
 */
(function() {
    "use strict";
    const WIDTH = 10;

    let undoStack = [];
    let redoStack = [];
    let curState = null;
    let isMouseDown = false;

    window.addEventListener("load", init);

    /**
     * Run once the page loads.
     */
    function init() {
        /* remove the page-rendering data attr so that the css knows that the page is done loading
        this makes the animation wait till the page is loaded, so that it actually renders the
        whole thing (if the animation starts during page load the element isn't visible for
        half the animation) */
        document.body.dataset.pageLoad = "";

        let canvas = document.getElementsByTagName("canvas")[0];
        // per MDN, canvas context size must be set using the html properties width and height
        // using javascript and computed styles because the canvas size is relative to the viewport
        // width
        let computedCanvas = window.getComputedStyle(canvas);
        canvas.width = computedCanvas.width.substring(0, computedCanvas.width.length - 2);
        canvas.height = computedCanvas.height.substring(0, computedCanvas.height.length - 2);
        let ctx = canvas.getContext("2d");
        ctx.lineWidth = WIDTH;

        let undoBtn = document.getElementById("btn-undo");
        let redoBtn = document.getElementById("btn-redo");

        canvas.addEventListener("mousedown", () => {
            onMouseDown(event, canvas);
        });
        canvas.addEventListener("mousemove", (event) => {
            onMouseMove(event, canvas);
        });
        canvas.addEventListener("mouseup", () => {
            onMouseUp(undoBtn);
        });
        document.getElementById("button-row").childNodes.forEach(setupBtnListeners);
        undoBtn.addEventListener("click", () => {
            onUndoClick(undoBtn, redoBtn);
        });
        redoBtn.addEventListener("click", () => {
            onRedoClick(undoBtn, redoBtn);
        });
        document.getElementById("btn-fill").addEventListener("click", clear);   // todo: add color
        document.getElementById("btn-clear").addEventListener("click", clear);

        clear();
        setInterval(() => {
            render(ctx);
        }, 10);
    }

    /**
     * Event handler to handle mouse down events. Starts a new stroke
     * and changes state so that {@link onMouseMove} starts recording
     * cursor positions.
     *
     * @param {MouseEvent} event - The event from the event listener containing mouse data
     * @param {HTMLElement} canvas - The canvas the user is drawing on
     */
    function onMouseDown(event, canvas) {
        if (curState) {
            if (curState === "paint") {
                undoStack.push(createNewStroke(curState, "#000000", []));
                isMouseDown = true;
            } else if (curState === "rect") {
                let lastStroke = undoStack[undoStack.length  - 1];
                let mousePos = getMousePos(canvas, event);
                if (lastStroke.command === "rect" && !lastStroke.done) {
                    // setting 2nd point of a rect in progress
                    lastStroke.pos[1] = mousePos;
                    // retroactively add another attribute to the stroke
                    // to track if the rect is final
                    lastStroke.done = true;
                    // end the stroke here
                    isMouseDown = false;
                } else {    // starting a new rect
                    undoStack.push(createNewStroke(curState, "#000000",
                                    [mousePos, mousePos]));
                    isMouseDown = true;
                }
            }
        }
    }

    /**
     * Event handler to handle mouse move events. Records cursor positions
     * on the canvas if we are currently making a stroke.
     *
     * @param {MouseEvent} event - The event from the event listener containing mouse data
     * @param {HTMLElement} canvas - The canvas the user is drawing on
     */
    function onMouseMove(event, canvas) {
        if (isMouseDown) {
            let lastStroke = undoStack[undoStack.length - 1];
            if (curState === "paint") {
                lastStroke.pos.push(getMousePos(canvas, event));
            } else if (curState === "rect" && !lastStroke.done) {
                // constantly set the second pos for the render function to show the user
                // where the rectangle would be. this isn't final until the second mouse down
                lastStroke.pos[1] = getMousePos(canvas, event);
            }
        }
    }

    /**
     * Event handler to handle mouse up events. Stops the current stroke.
     * Also enables the undo button, because now there is at least one stroke to undo.
     *
     * @param {HTMLElement} undoBtn - A reference to the undo button
     */
    function onMouseUp(undoBtn) {
        if (curState === "paint") {
            isMouseDown = false;
        }
        setButtonDisableStatus(undoBtn, false);
    }

    /**
     * For each element on the button row, takes that element and if it is a button
     * that is a state change element, attach an event listener that changes the
     * current status to the state represented by the button.
     *
     * @param {HTMLElement} node - The element in the button row, potentially a button
     */
    function setupBtnListeners(node) {
        if (node.nodeName === "BUTTON" && node.dataset.stateChange !== "no") {
            const stateName = node.id.substring(4);   // btn- is 4 chars.
            node.addEventListener("click", () => {
                if (curState) {
                    // if there is currently a tool selected, remove the selected attr from it
                    document.getElementById("btn-" + curState).dataset.selected = false;
                }
                curState = stateName;
                node.dataset.selected = true;
            });
        }
    }

    /**
     * Handles a click on the undo button. Takes the last stroke done, removes it from the
     * list of strokes to draw, and adds it to the redo buffer for future redoing
     *
     * @param {HTMLElement} undoBtn - A reference to the undo button
     * @param {HTMLElement} redoBtn - A reference to the redo button
     */
    function onUndoClick(undoBtn, redoBtn) {
        let stroke = undoStack.pop();
        redoStack.push(stroke);
        setButtonDisableStatus(redoBtn, false);
        if (undoStack.length === 1) {    // don't undo the initial canvas clear
            setButtonDisableStatus(undoBtn, true);
        }
    }

    /**
     * Handles a click on the redo button. Takes the last stroke undone, removes it from the
     * list of undone strokes, and adds it to the undo and draw buffers for drawing and future
     * undoing.
     * 
     * @param {HTMLElement} undoBtn - A reference to the undo button
     * @param {HTMLElement} redoBtn - A reference to the redo button
     */
    function onRedoClick(undoBtn, redoBtn) {
        let stroke = redoStack.pop();
        undoStack.push(stroke);
        if (redoStack.length === 0) {
            setButtonDisableStatus(redoBtn, true);
        }
        setButtonDisableStatus(undoBtn, false);
    }

    /**
     * Sets the disabled state of the given button.
     *
     * @param {HTMLElement} button - The button to change the state on
     * @param {boolean} disabled - Whether or not the button should be disabled
     */
    function setButtonDisableStatus(button, disabled) {
        if ((button.disabled && !disabled) || (!button.disabled && disabled)) {
            button.disabled = disabled;
        }
    }

    /**
     * Renders all of the strokes onto the canvas.
     *
     * @param {CanvasRenderingContext2D} ctx - The context for the canvas
     */
    function render(ctx) {
        for (let stroke of undoStack) {
            if (stroke.command === "paint") {
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                for (let pos of stroke.pos) {
                    ctx.lineTo(pos.x, pos.y);
                }
                ctx.stroke();
            } else if (stroke.command === "fill") {
                ctx.fillStyle = stroke.color;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            } else if (stroke.command === "rect") {
                ctx.fillStyle = stroke.color;
                let x = stroke.pos[0].x;
                let y = stroke.pos[0].y;
                let width = stroke.pos[1].x - x;
                let height = stroke.pos[1].y - y;
                ctx.fillRect(x, y, width, height);
            }
        }
    }

    /**
     * Clears the canvas. As a side-effect, also clears the redo
     * buffer and disables the redo button - once we clear the canvas
     * we assume that the user no longer wants to redo.
     */
    function clear() {
        redoStack = [];
        document.getElementById("btn-redo").disabled = true;
        undoStack.push(createNewStroke("fill", "#ffffff"));
    }

    /**
     * Given a canvas and a mouse move event, finds the position of the center of the cursor
     * realitve to the canvas.
     * 
     * @param {HTMLElement} canvas - The canvas to get the mouse cursor relative to
     * @param {MouseEvent} mouseEvent - The mouse event that holds cursor data
     * @returns {Object} The position of the center of the cursor relative to the canvas.
     */
    function getMousePos(canvas, mouseEvent) {
        let canvasOffset = { x: canvas.offsetLeft, y: canvas.offsetTop };
        return {
            x: mouseEvent.clientX - canvasOffset.x - 10,
            y: mouseEvent.clientY - canvasOffset.y - 10
        };
    }

    /**
     * Creates a new stroke object and returns it. A stroke object represents a certain
     * draw command, the color to draw in, and the positions to draw at, if relevant
     *
     * @param {string} command - The draw command to run
     * @param {string} color - The color to draw in
     * @param {Object[]} [pos=null] - An optional array of mouse positions to draw at
     * @return {Object} An object representing that specific stroke
     */
    function createNewStroke(command, color, pos=null) {
        return { command: command, color: color, pos: pos };
    }
})();

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
    /**
     * The max distance a stroke can be from the center of the cursor and still be deleted
     */
    const DELSTROKE_TOLERANCE = 15 / 2;
    /**
     * The width of a stroke.
     */
    const WIDTH = 10;

    let undoStack = [];
    let redoStack = [];
    let curState = null;
    let isMouseDown = false;
    let backgroundColor = "#ffffff";
    let mousePos = undefined;

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

        let undoBtn = id("btn-undo");
        let redoBtn = id("btn-redo");

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", (event) => {
            onMouseMove(event, canvas);
        });
        canvas.addEventListener("mouseup", () => {
            onMouseUp(undoBtn);
        });
        id("button-row").childNodes.forEach(setupBtnListeners);
        undoBtn.addEventListener("click", () => {
            onUndoClick(undoBtn, redoBtn);
        });
        redoBtn.addEventListener("click", () => {
            onRedoClick(undoBtn, redoBtn);
        });
        id("btn-fill").addEventListener("click", clear);   // todo: add color
        // id("btn-sticker").addEventListener("click", sticker);
        id("btn-save").addEventListener("click", () => {
            save(canvas);
        });

        clear();
        setInterval(() => {
            render(ctx);
        }, 10);
    }

    /**
     * Event handler to handle mouse down events. Starts a new stroke
     * and changes state so that {@link onMouseMove} starts recording
     * cursor positions.
     */
    function onMouseDown() {
        if (curState) {
            if (curState === "paint" || curState === "freeform" || curState === "erase") {
                // hold mouse down to draw tools
                // color is ignored in the case of erase
                undoStack.push(createNewStroke(curState, "#000000", []));
                isMouseDown = true;
            } else if (curState === "rect" || curState === "line") {
                // two point shape tools
                let lastStroke = undoStack[undoStack.length  - 1];
                if ((lastStroke.command === "rect" || lastStroke.command === "line") &&
                        !lastStroke.done) {
                    // setting 2nd point of a shape in progress
                    lastStroke.pos[1] = mousePos;
                    // retroactively add another attribute to the stroke
                    // to track if the shape is final
                    lastStroke.done = true;
                    // end the stroke here
                    isMouseDown = false;
                } else {    // starting a new shape
                    undoStack.push(createNewStroke(curState, "#000000",
                                    [mousePos, mousePos]));
                    isMouseDown = true;
                }
            } else if (curState === "delstroke") {
                // delete stroke tool
                // finds any strokes near the given position and deletes them from rendering

                // step 1: find the most recent fill
                // we only want to delete strokes that are visible, and any strokes before a
                // fill are not.

                // personally i would use a for loop from length-1 to 0, breaking at a fill,
                // but per style guide 6.2 break is not allowed
                let lastFillIdx = undoStack.length - 1;
                while (lastFillIdx > 0 && undoStack[lastFillIdx].command !== "fill") {
                    lastFillIdx--;
                }
                // now lastFillIdx is definitely the index of a fill. since the first command
                // is a fill, even if we hit index 0 our first command is a fill

                // step 2: from that index to length check each stroke for proximity to current
                // mouse pos
                let undoneStrokes = [];
                for (let i = lastFillIdx + 1; i < undoStack.length; i++) {
                    let stroke = undoStack[i];
                    if (stroke.command === "paint" || stroke.command === "freeform") {
                        // would use a for loop and break on delete but break is banned
                        let j = 0;
                        let deleted = false;
                        while (j < stroke.pos.length && !deleted) {
                            let pos = stroke.pos[j];
                            if (distance(pos, mousePos) < DELSTROKE_TOLERANCE) {
                                // i-- because after the deletion indexes shift over
                                undoneStrokes.push(undoStack.splice(i--, 1)[0]);
                                deleted = true;
                            }
                            j++;
                        }
                    } else if (stroke.command === "line" || stroke.command === "rect") {
                        let xMin = Math.min(stroke.pos[0].x, stroke.pos[1].x) - DELSTROKE_TOLERANCE;
                        let xMax = Math.max(stroke.pos[0].x, stroke.pos[1].x) + DELSTROKE_TOLERANCE;
                        let yMin = Math.min(stroke.pos[0].y, stroke.pos[1].y) - DELSTROKE_TOLERANCE;
                        let yMax = Math.max(stroke.pos[0].y, stroke.pos[1].y) + DELSTROKE_TOLERANCE;
                        if (mousePos.x >= xMin && mousePos.x <= xMax && mousePos.y >= yMin &&
                                mousePos.y <= yMax) {
                            undoneStrokes.push(undoStack.splice(i--, 1)[0]);
                        }
                    }
                }

                // step 3: pack all of those undone strokes into a single command to undo
                if (undoneStrokes.length > 0) {
                    let bundle = createNewStroke("delstroke", null);
                    bundle.strokes = undoneStrokes;
                    undoStack.push(bundle);
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
        mousePos = getMousePos(canvas, event);
        if (isMouseDown) {
            let lastStroke = undoStack[undoStack.length - 1];
            if (curState === "paint" || curState === "freeform" || curState === "erase") {
                lastStroke.pos.push(mousePos);
            } else if ((curState === "rect" || curState === "line") && !lastStroke.done) {
                // constantly set the second pos for the render function to show the user
                // where the rectangle would be. this isn't final until the second mouse down
                lastStroke.pos[1] = mousePos;
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
        if (curState) {
            if (curState === "paint" || curState === "freeform" || curState === "erase") {
                isMouseDown = false;
            }
            setButtonDisableStatus(undoBtn, false);
        }
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
                    id("btn-" + curState).dataset.selected = false;
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
        if (stroke.command === "delstroke") {
            stroke.strokes.forEach((stroke) => {
                undoStack.push(stroke);
            });
        }
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
        if (stroke.command === "delstroke") {
            stroke.strokes.forEach((stroke) => {
                undoStack.splice(undoStack.indexOf(stroke), 1);
            });
        }
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
            if (stroke.command === "paint" || stroke.command === "freeform") {
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                for (let pos of stroke.pos) {
                    ctx.lineTo(pos.x, pos.y);
                }
                if (stroke.command === "freeform") {
                    ctx.closePath();
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
            } else if (stroke.command === "line") {
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                ctx.moveTo(stroke.pos[0].x, stroke.pos[0].y);
                ctx.lineTo(stroke.pos[1].x, stroke.pos[1].y);
                ctx.stroke();
            } else if (stroke.command === "erase") {
                // special case for eraser so that it erases the entirety of a
                // circular region instead of just the line, as it's a weird
                // and unpredictable shape.
                ctx.fillStyle = backgroundColor;
                for (let pos of stroke.pos) {
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, WIDTH, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }

        // draw helper - small circle to help indicate where it will erase
        if (curState === "erase" || curState === "delstroke") {
            ctx.strokeStyle = "#666666";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 2]);
            ctx.beginPath();
            ctx.arc(mousePos.x, mousePos.y, WIDTH, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.lineWidth = WIDTH;
            ctx.setLineDash([]);
        }
    }

    /**
     * Clears the canvas. As a side-effect, also clears the redo
     * buffer and disables the redo button - once we clear the canvas
     * we assume that the user no longer wants to redo.
     */
    function clear() {
        redoStack = [];
        id("btn-redo").disabled = true;
        undoStack.push(createNewStroke("fill", backgroundColor));
    }

    /**
     * Saves the given canvas to a PNG file and starts a download.
     *
     * @param {HTMLElement} canvas - The canvas to save
     */
    function save(canvas) {
        let dataURL = canvas.toDataURL();
        // force a download by clicking a <a> tag
        // this tag is not for the dom, just generated
        // for javascript purposes
        // https://stackoverflow.com/a/45905238/1108513
        let downloadAnchor = document.createElement("a");
        downloadAnchor.href = dataURL;
        downloadAnchor.download = "art.png";
        downloadAnchor.click();
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

    /**
     * Given two objects with x and y coordinates, returns the distance between the two
     * points.
     *
     * @param {Object} pos1 - The first point
     * @param {Object} pos2 - The second point
     * @return {Number} The distance between the two points
     */
    function distance(pos1, pos2) {
        return Math.sqrt(Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2));
    }

    /* CSE 154 SHORTCUT FUNCTIONS */

    /**
     * Returns the DOM element with the given id.
     *
     * @param {string} idName - The id to search for
     * @returns {HTMLElement} The element with that id
     */
    function id(idName) {
        return document.getElementById(idName);
    }

    /**
     * Returns the first element in the DOM tree that matches the given selector.
     * 
     * @param {string} selector - The selector to search with
     * @returns {HTMLELement} The first element in the DOM that matches that selector
     */
    function qs(selector) {
        return document.querySelector(selector);
    }

    /**
     * Returns all the elements in the DOM that match the given selector.
     *
     * @param {string} selector - The selector to search with
     * @returns {HTMLELement[]} All elements in the DOM that match that selector
     */
    function qsa(selector) {
        return document.querySelectorAll(selector);
    }
})();

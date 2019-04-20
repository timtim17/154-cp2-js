/**
 * @author Austin Jenchi
 * CSE 154 AQ 19sp
 * @date 04-18-2019
 * @file Javascript to control the functionality of the paint applications.
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
    let color = "#000000";
    let backgroundColor = "#ffffff";
    let mousePos = undefined;
    // future functionality: use a file input to accept more stickers.
    // could be stored either as data-urls in localstorage or stored server side
    let stickers = ["img/sticker-pikachu.png", "img/sticker-rainbowdash.png",
                        "img/sticker-eyes.png", "img/sticker-thinking.png",
                        "img/sticker-gomez.png"];
    let curSticker = undefined;

    window.addEventListener("load", init);

    /**
     * Run once the page loads. Sets up event listeners, and sets the canvas settings.
     */
    function init() {
        /* remove the dom-loading class so that the css knows that the page is done loading
        this makes the animation wait till the page is loaded, so that it actually renders the
        whole thing (if the animation starts during page load the element isn't visible for
        half the animation) */
        qsa(".dom-loading").forEach((node) => {
            node.classList.remove("dom-loading");
        });

        let canvas = qs("canvas");
        window.addEventListener("resize", () => {
            /* resize handler holds behavior. this resizes the canvas so it's at a decent proportion
            even when the window is resized. this behavior is not recommended however, as the lines
            start to act weirdly, though it does function */
            resizeCanvas(canvas);
        });
        resizeCanvas(canvas);
        let ctx = canvas.getContext("2d");
        ctx.lineWidth = WIDTH;

        let undoBtn = id("btn-undo");
        let redoBtn = id("btn-redo");

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", (event) => {
            onMouseMove(event, canvas);
        });
        canvas.addEventListener("mouseup", onMouseUp);
        id("button-row").childNodes.forEach(setupBtnListeners);
        undoBtn.addEventListener("click", onUndoClick);
        redoBtn.addEventListener("click", onRedoClick);
        id("btn-fill").addEventListener("click", () => {
            // by default event handler passes in a reference to the event
            // if i were to just do addEventListener("click", func),
            // func would get the event. in this case i don't want that,
            // since i have a default value for the first parameter
            fill();
        });
        id("btn-save").addEventListener("click", () => {
            save(canvas);
        });
        id("in-color").addEventListener("change", changeColor);

        id("btn-sticker").addEventListener("click", toggleStickersVisibility);
        setupStickers();

        fill(backgroundColor);
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
                undoStack.push(createNewStroke(curState, color, []));
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
                    undoStack.push(createNewStroke(curState, color,
                                    [mousePos, mousePos]));
                    isMouseDown = true;
                }
            } else if (curState === "delstroke") {
                helperDelStroke();
            } else if (curState === "sticker") {
                let stroke = createNewStroke("sticker", null, [mousePos]);
                stroke.sticker = curSticker;
                undoStack.push(stroke);
            }
        }
    }

    /**
     * A function to help with the delstroke tool so that {@link onMouseDown} is more readable.
     * Given the current mouse position in a module-global variable, finds all strokes near the
     * cursor and move them from the drawing undo buffer to the redo buffer.
     */
    function helperDelStroke() {
        // delete stroke tool
        // finds any strokes near the given position and deletes them from rendering

        // step 1: find the most recent fill
        // we only want to delete strokes that are visible, and any strokes before a
        // fill are not.
        let lastFillIdx = findLastCmdMatch(undoStack, "fill");
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
     */
    function onMouseUp() {
        if (curState) {
            if (curState === "paint" || curState === "freeform" || curState === "erase") {
                isMouseDown = false;
            }
            setButtonDisableStatus("btn-undo", false);
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
               changeState(stateName);
            });
        }
    }

    /**
     * Changes the current state -- the tool in use. Changes the UI so that the currently in
     * use tool is highlighted in red border. Assumes that all state buttons follow the format
     * for id "btn-statename".
     *
     * @param {string} newState - The state to activate
     */
    function changeState(newState) {
        if (curState) {
            // if there is currently a tool selected, remove the selected attr from it
            id("btn-" + curState).dataset.selected = false;
        }
        if (id("stickers").dataset.active === "true") {
            toggleStickersVisibility();
        }
        curState = newState;
        id("btn-" + newState).dataset.selected = true;
    }

    /**
     * Handles a click on the undo button. Takes the last stroke done, removes it from the
     * list of strokes to draw, and adds it to the redo buffer for future redoing
     */
    function onUndoClick() {
        let stroke = undoStack.pop();
        if (stroke.command === "delstroke") {
            stroke.strokes.forEach((stroke) => {
                undoStack.push(stroke);
            });
        } else if (stroke.command === "fill") {
            // grab the previous fill color so that backgroundColor has the correct color and
            // the eraser erases with the correct color.
            backgroundColor = undoStack[findLastCmdMatch(undoStack, "fill")].color;
        }
        redoStack.push(stroke);
        setButtonDisableStatus("btn-redo", false);
        if (undoStack.length === 1) {    // don't undo the initial canvas clear
            setButtonDisableStatus("btn-undo", true);
        }
    }

    /**
     * Handles a click on the redo button. Takes the last stroke undone, removes it from the
     * list of undone strokes, and adds it to the undo and draw buffers for drawing and future
     * undoing.
     */
    function onRedoClick() {
        let stroke = redoStack.pop();
        if (stroke.command === "delstroke") {
            stroke.strokes.forEach((stroke) => {
                undoStack.splice(undoStack.indexOf(stroke), 1);
            });
        } else if (stroke.command === "fill") {
            // we're filling the canvas with a new color, so reset backgroundColor so that
            // erase has the correct color
            backgroundColor = stroke.color;
        }
        undoStack.push(stroke);
        if (redoStack.length === 0) {
            setButtonDisableStatus("btn-redo", true);
        }
        setButtonDisableStatus("btn-undo", false);
    }

    /**
     * Sets the disabled state of the named button.
     *
     * @param {string} btnId - The id of the button to change the state on
     * @param {boolean} disabled - Whether or not the button should be disabled
     */
    function setButtonDisableStatus(btnId, disabled) {
        let button = id(btnId);
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
            } else if (stroke.command === "sticker") {
                ctx.drawImage(stroke.sticker, stroke.pos[0].x - stroke.sticker.width / 2,
                    stroke.pos[0].y - stroke.sticker.height / 2);
            }
        }

        renderEraserHelper(ctx);
        renderStickerPlaceholder(ctx);
    }

    /**
     * Draws a small circle when the current tool is an eraser tool so that it is easier to see what
     * is being erased.
     *
     * @param {CanvasRenderingContext2D} ctx - The context to draw on the canvas
     */
    function renderEraserHelper(ctx) {
        if (curState === "erase" || curState === "delstroke") {
            // draw helper - small circle to help indicate where it will erase
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
     * Renders a semi-transparent preview of the selected sticker when the sticker tool is in use.
     *
     * @param {CanvasRenderingContext2D} ctx - The context to draw on the canvas
     */
    function renderStickerPlaceholder(ctx) {
        if (curState === "sticker") {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(curSticker, mousePos.x - curSticker.width / 2,
                mousePos.y - curSticker.height / 2);
            ctx.globalAlpha = 1.0;
        }
    }

    /**
     * Fills the canvas, effectively clearing. As a side-effect, also clears the redo buffer
     * and disables the redo button- once we clear the canvas we assume that the user
     * no longer wants to redo.
     *
     * Optionally, a color can be passed in to be forced as the color to fill with. Otherwise,
     * the currently selected color is used as the fill color. That color is stored for future
     * erasing.
     *
     * @param {string} [colorOverride=undefined] - Color to override default color behavior with
     */
    function fill(colorOverride=undefined) {
        redoStack = [];
        setButtonDisableStatus("btn-redo", true);
        if (colorOverride) {
            undoStack.push(createNewStroke("fill", colorOverride));
        } else {
            backgroundColor = color;
            undoStack.push(createNewStroke("fill", backgroundColor));
        }
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
        let downloadAnchor = document.createElement("a");
        downloadAnchor.href = dataURL;
        downloadAnchor.download = "art.png";
        downloadAnchor.click();
    }

    /**
     * Changes the color being drawn in. Gets the color value from a color input element,
     * which is assumed to be the scope in {this}. Thus, this method must only be called
     * by an event listener on a color input.
     */
    function changeColor() {
        color = this.value;
    }

    /**
     * Toggles the visibility of the sticker container.
     */
    function toggleStickersVisibility() {
        let stickers = id("stickers");
        if (stickers.dataset.active === "true") {
            stickers.dataset.active = false;
        } else {
            stickers.dataset.active = true;
        }
    }

    /**
     * Sets up stickers. Takes the list of available stickers
     * and generates an element for each one.
     */
    function setupStickers() {
        let stickerImgCont = qs("#stickers div");
        for (let sticker of stickers) {
            let ele = document.createElement("img");
            ele.src = sticker;
            ele.alt = "pixel art sticker";
            ele.addEventListener("click", function() {
                changeState("sticker");
                curSticker = this;
            });
            stickerImgCont.appendChild(ele);
        }
    }

    /**
     * Given a canvas and a mouse move event, finds the position of the center of the cursor
     * relative to the canvas.
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

    /**
     * Finds the most recent occurrence of the given command name in the given list.
     * The list is expected to be a list of "stroke" commands, matching the stroke structure,
     * see {@link createNewStroke}.
     * 
     * @param {Any[]} list - The list to search through
     * @param {string} cmd - The command name to search for
     * @returns {int} The index of the occurrence furthest in the list, or -1 if not found
     */
    function findLastCmdMatch(list, cmd) {
        // personally i would use a for loop from length-1 to 0, breaking at a match,
        // but per style guide 6.2 break is not allowed
        let idx = list.length - 1;
        while (idx >= 0 && list[idx].command !== cmd) {
            idx--;
        }
        return idx;
    }

    /**
     * Handles viewport resizes by changing the canvas width and height so it renders properly.
     * @param {HTMLElement} canvas - The canvas to resize
     */
    function resizeCanvas(canvas) {
        // per MDN, canvas context size must be set using the html properties width and height
        // using javascript and computed styles because the canvas size is relative to the viewport
        // width
        let computedCanvas = window.getComputedStyle(canvas);
        canvas.width = computedCanvas.width.substring(0, computedCanvas.width.length - 2);
        canvas.height = computedCanvas.height.substring(0, computedCanvas.height.length - 2);
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
     * @returns {HTMLElement} The first element in the DOM that matches that selector
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

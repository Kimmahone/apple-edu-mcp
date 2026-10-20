-- Only a document ID returned by the fixed authoring bridge is accepted by Node.
-- No user script or command is evaluated. The caller already validated the new Output path.
on run argv
    if (count of argv) is not 5 then error "INVALID_INPUT"
    set appKey to item 1 of argv
    if appKey is "numbers" then
        set appId to "com.apple.iWork.Numbers"
    else if appKey is "pages" then
        set appId to "com.apple.iWork.Pages"
    else if appKey is "keynote" then
        set appId to "com.apple.iWork.Keynote"
    else
        error "INVALID_APP"
    end if
    set edition to item 5 of argv
    if edition is "creator_studio" then
        if appKey is "numbers" then
            set appId to "com.apple.Numbers"
        else if appKey is "pages" then
            set appId to "com.apple.Pages"
        else
            set appId to "com.apple.Keynote"
        end if
    else if edition is not "classic" then
        error "INVALID_EDITION"
    end if
    set documentId to item 2 of argv
    set targetPath to item 3 of argv
    set operation to item 4 of argv
    set saveAcknowledged to true
    using terms from application "Numbers"
        tell application id appId
            set targetDoc to document id documentId
            if operation is "save" then
                try
                    with timeout of 5 seconds
                        set currentFile to file of targetDoc
                        if currentFile is missing value then
                            save targetDoc in POSIX file targetPath
                        else
                            if (currentFile as alias) is not (POSIX file targetPath as alias) then error "TARGET_PATH_MISMATCH"
                            -- Existing files use Save, not Save As to the same URL.
                            -- Pages 14.5 otherwise reports an external-change conflict.
                            save targetDoc
                        end if
                    end timeout
                on error errorText number errorNumber
                    if errorNumber is not -1712 then error errorText number errorNumber
                    set saveAcknowledged to false
                end try
            else if operation is not "close" then
                error "INVALID_OPERATION"
            end if
            -- Never discard changes that remain after a failed save or appeared
            -- while a read-only snapshot was being collected. Leave the window open.
            if modified of targetDoc then error "UNSAVED_CHANGES"
            with timeout of 10 seconds
                close targetDoc saving no
            end timeout
        end tell
    end using terms from
    if saveAcknowledged then return "{\"saveAcknowledged\":true}"
    return "{\"saveAcknowledged\":false}"
end run

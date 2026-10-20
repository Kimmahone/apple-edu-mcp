-- Formula source is fixed here. No user argument is evaluated as a formula.
on run argv
    if (count of argv) < 7 then error "INVALID_INPUT"
    set targetPath to item 1 of argv
    set titleText to item 2 of argv
    set firstHeader to item 3 of argv
    set secondHeader to item 4 of argv
    set dataCount to (item 5 of argv) as integer
    if dataCount < 1 or dataCount > 30 or (count of argv) is not (5 + dataCount * 2) then error "INVALID_INPUT"
    set formulaRange to "B2"
    if dataCount > 1 then set formulaRange to "B2:B" & (dataCount + 1)
    set createdDoc to missing value
    set saveAcknowledged to true
    tell application id "com.apple.iWork.Numbers"
        with timeout of 15 seconds
            try
                set createdDoc to make new document with properties {document template:template id "Application/Blank/Traditional"}
                tell sheet 1 of createdDoc
                    set name to "관찰 자료"
                    tell table 1
                        set name to titleText
                        set row count to dataCount + 3
                        set column count to 2
                        set header row count to 1
                        set header column count to 0
                        set footer row count to 0
                        set width of column 1 to 240
                        set width of column 2 to 140
                        set font name of cell range to "Apple SD Gothic Neo"
                        set font size of cell range to 12
                        set text wrap of cell range to true
                        set format of column 1 to text
                        set value of cell "A1" to firstHeader
                        set format of cell "B1" to text
                        set value of cell "B1" to secondHeader
                        repeat with rowIndex from 1 to dataCount
                            set value of cell ("A" & (rowIndex + 1)) to item (4 + rowIndex * 2) of argv
                            set value of cell ("B" & (rowIndex + 1)) to (item (5 + rowIndex * 2) of argv) as real
                        end repeat
                        set value of cell ("A" & (dataCount + 2)) to "합계"
                        set value of cell ("B" & (dataCount + 2)) to "=SUM(" & formulaRange & ")"
                        set value of cell ("A" & (dataCount + 3)) to "평균"
                        set value of cell ("B" & (dataCount + 3)) to "=AVERAGE(" & formulaRange & ")"
                    end tell
                end tell
                try
                    with timeout of 5 seconds
                        save createdDoc in POSIX file targetPath
                    end timeout
                on error errorText number errorNumber
                    if errorNumber is not -1712 then error errorText number errorNumber
                    set saveAcknowledged to false
                end try
                close createdDoc saving no
                if saveAcknowledged then return "{\"saveAcknowledged\":true}"
                return "{\"saveAcknowledged\":false}"
            on error errorText number errorNumber
                if createdDoc is not missing value then
                    try
                        close createdDoc saving no
                    end try
                end if
                error errorText number errorNumber
            end try
        end timeout
    end tell
end run

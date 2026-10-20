use framework "Foundation"
use scripting additions
on near(actualNumber, expectedNumber)
    if actualNumber is missing value then return false
    try
        set difference to (actualNumber as real) - expectedNumber
        if difference < 0 then set difference to -difference
        set magnitude to expectedNumber
        if magnitude < 0 then set magnitude to -magnitude
        return difference < ((magnitude + 1) * 0.000000001)
    on error
        return false
    end try
end near
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
    set matchedDoc to missing value
    set valuesOK to true
    set labelsOK to true
    set expectedSum to 0.0
    tell application id "com.apple.iWork.Numbers"
        with timeout of 10 seconds
            repeat 40 times
                repeat with candidate in documents
                    try
                        if (POSIX path of (file of candidate as alias)) is targetPath then
                            set matchedDoc to contents of candidate
                            exit repeat
                        end if
                    end try
                end repeat
                if matchedDoc is not missing value then exit repeat
                delay 0.2
            end repeat
            if matchedDoc is missing value then error "GENERATED_DOCUMENT_NOT_OPEN"
            set sheetTotal to count of sheets of matchedDoc
            tell sheet 1 of matchedDoc
                set shapeOK to ((count of tables) is 1 and name is "관찰 자료")
                tell table 1
                    set shapeOK to (shapeOK and row count is dataCount + 3 and column count is 2 and header row count is 1)
                    set labelsOK to (name is titleText and value of cell "A1" is firstHeader and value of cell "B1" is secondHeader)
                    repeat with rowIndex from 1 to dataCount
                        set expectedLabel to item (4 + rowIndex * 2) of argv
                        set expectedNumber to (item (5 + rowIndex * 2) of argv) as real
                        set expectedSum to expectedSum + expectedNumber
                        if value of cell ("A" & (rowIndex + 1)) is not expectedLabel then set labelsOK to false
                        if formula of cell ("A" & (rowIndex + 1)) is not missing value then set labelsOK to false
                        if not my near(value of cell ("B" & (rowIndex + 1)), expectedNumber) then set valuesOK to false
                        if formula of cell ("B" & (rowIndex + 1)) is not missing value then set valuesOK to false
                    end repeat
                    if value of cell ("A" & (dataCount + 2)) is not "합계" or value of cell ("A" & (dataCount + 3)) is not "평균" then set labelsOK to false
                    set sumFormula to formula of cell ("B" & (dataCount + 2))
                    set averageFormula to formula of cell ("B" & (dataCount + 3))
                    set formulasOK to (sumFormula is ("=SUM(" & formulaRange & ")") and averageFormula is ("=AVERAGE(" & formulaRange & ")"))
                    set actualSum to value of cell ("B" & (dataCount + 2))
                    set actualAverage to value of cell ("B" & (dataCount + 3))
                end tell
            end tell
        end timeout
    end tell
    set calculationsOK to ((my near(actualSum, expectedSum)) and (my near(actualAverage, expectedSum / dataCount)))
    if actualSum is missing value then set actualSum to current application's NSNull's null()
    if actualAverage is missing value then set actualAverage to current application's NSNull's null()
    set resultObject to current application's NSDictionary's dictionaryWithObjects:{sheetTotal, shapeOK, labelsOK, valuesOK, formulasOK, calculationsOK, actualSum, actualAverage} forKeys:{"sheetCount", "tableShapeMatches", "labelsMatch", "valuesMatch", "formulasMatch", "calculationsMatch", "sum", "average"}
    set encodedData to current application's NSJSONSerialization's dataWithJSONObject:resultObject options:0 |error|:(missing value)
    return (current application's NSString's alloc()'s initWithData:encodedData encoding:(current application's NSUTF8StringEncoding)) as text
end run
